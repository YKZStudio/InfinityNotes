package com.ykzstudio.infinitynotes.storage
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.documentfile.provider.DocumentFile
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.util.concurrent.Executors

@InvokeArg class Entry {var path:String="";var data:String=""}
@InvokeArg class StorageArgs {var uri:String="";var data:String="";var files:Array<Entry> = emptyArray();var version:String="embedded"}
@InvokeArg class AppearanceArgs {var dark:Boolean=false}
@TauriPlugin
class StoragePlugin(private val activity:Activity):Plugin(activity){
    private val worker=Executors.newSingleThreadExecutor()
    private var browser:WebView?=null
    private var lastInsets:String?=null
    private fun insets():JSObject {
        val view=browser?:return JSObject()
        val bars=view.rootWindowInsets?.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())?:return JSObject()
        val location=IntArray(2);view.getLocationInWindow(location)
        val decor=activity.window.decorView
        val density=activity.resources.displayMetrics.density
        // Only add the part overlapping the WebView. Already padded windows need no second inset.
        return JSObject().apply {
            put("top",(bars.top-location[1]).coerceAtLeast(0)/density)
            put("left",(bars.left-location[0]).coerceAtLeast(0)/density)
            put("bottom",(location[1]+view.height-(decor.height-bars.bottom)).coerceAtLeast(0)/density)
            put("right",(location[0]+view.width-(decor.width-bars.right)).coerceAtLeast(0)/density)
        }
    }
    override fun load(webView:WebView){
        browser=webView
        // Observe layout without replacing Tauri's own WindowInsets listener.
        webView.viewTreeObserver.addOnGlobalLayoutListener {
            val value=insets().toString()
            if(value!=lastInsets){
                lastInsets=value
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('infinity-insets',{detail:$value}))",null)
            }
        }
    }
    @Command fun windowInsets(invoke:Invoke){
        val args=invoke.parseArgs(AppearanceArgs::class.java)
        activity.runOnUiThread {
            try{
                val flags=WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                activity.window.insetsController?.setSystemBarsAppearance(if(args.dark)0 else flags,flags)
                invoke.resolve(insets())
            }catch(e:Exception){invoke.reject(e.message?:"无法读取安全边距")}
        }
    }
    private fun root(uri:String):DocumentFile {
        val u=Uri.parse(uri)
        check(activity.contentResolver.persistedUriPermissions.any{it.uri==u&&it.isReadPermission&&it.isWritePermission}){"文件夹授权已失效，请重新选择"}
        return DocumentFile.fromTreeUri(activity,u)?.takeIf{it.isDirectory&&it.canRead()&&it.canWrite()}?:error("文件夹不可用")
    }
    private fun child(parent:DocumentFile,name:String):DocumentFile=parent.findFile(name)?:parent.createDirectory(name)?:error("无法创建目录")
    private fun read(file:DocumentFile?):String?=file?.let{activity.contentResolver.openInputStream(it.uri)?.bufferedReader()?.use{r->r.readText()}}
    private fun workspace(uri:String):String? {
        val dir=root(uri);val raw=read(dir.findFile("wuxianji-workspace.json"))
        if(raw!=null){try{JSONObject(raw);return raw}catch(_:Exception){}}
        val backup=read(dir.findFile("wuxianji-workspace.backup.json"))
        if(backup!=null){JSONObject(backup);return backup}
        check(raw==null){"工作区损坏，请先恢复备份"};return null
    }
    private fun write(parent:DocumentFile,name:String,bytes:ByteArray){
        val file=parent.findFile(name)?:parent.createFile("application/octet-stream",name)?:error("无法创建文件")
        activity.contentResolver.openOutputStream(file.uri,"wt")?.use{it.write(bytes);it.flush()}?:error("无法写入文件")
    }
    private fun run(invoke:Invoke,action:()->JSObject){worker.execute{try{invoke.resolve(action())}catch(e:Exception){invoke.reject(e.message?:"存储失败")}}}
    @Command fun pickFolder(invoke:Invoke){
        val intent=Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
        startActivityForResult(invoke,intent,"picked")
    }
    @ActivityCallback fun picked(invoke:Invoke,result:ActivityResult){
        if(result.resultCode!=Activity.RESULT_OK){invoke.reject("已取消选择");return}
        val uri=result.data?.data?:run{invoke.reject("未返回文件夹");return}
        try{val flags=(result.data?.flags?:0) and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION);activity.contentResolver.takePersistableUriPermission(uri,flags)}catch(e:Exception){invoke.reject(e.message?:"无法保留授权");return}
        run(invoke){JSObject().apply{put("uri",uri.toString());put("name",root(uri.toString()).name?:"无限记文件夹");put("workspace",workspace(uri.toString()))}}
    }
    @Command fun readWorkspace(invoke:Invoke){val a=invoke.parseArgs(StorageArgs::class.java);run(invoke){JSObject().apply{put("workspace",workspace(a.uri))}}}
    @Command fun writeWorkspace(invoke:Invoke){val a=invoke.parseArgs(StorageArgs::class.java);run(invoke){
        check(a.data.toByteArray().size<=32*1024*1024){"工作区过大"};JSONObject(a.data)
        val r=root(a.uri);val old=workspace(a.uri);if(old!=null)write(r,"wuxianji-workspace.backup.json",old.toByteArray())
        write(r,"wuxianji-workspace.json",a.data.toByteArray());JSObject()
    }}
    @Command fun writeRuntime(invoke:Invoke){val a=invoke.parseArgs(StorageArgs::class.java);run(invoke){
        check(a.version.matches(Regex("[A-Za-z0-9-]{1,80}"))){"无效版本"}
        val runtime=child(child(child(root(a.uri),"runtime"),"releases"),a.version)
        for(entry in a.files){val parts=entry.path.split('/');check(parts.all{it.isNotEmpty()&&it!="."&&it!=".."&&!it.contains('\\')&&!it.contains(':')}){"无效资源路径"}
            var dir=runtime;for(p in parts.dropLast(1))dir=child(dir,p);write(dir,parts.last(),Base64.decode(entry.data,Base64.DEFAULT))}
        JSObject()
    }}
}
