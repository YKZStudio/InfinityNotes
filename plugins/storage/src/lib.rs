use tauri::{plugin::{Builder, TauriPlugin}, Manager, Runtime};
pub struct Storage<R:Runtime>{
    #[cfg(target_os="android")] handle:tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os="android"))] marker:std::marker::PhantomData<R>,
}
impl<R:Runtime> Storage<R>{
    pub fn call(&self, method:&str, args:serde_json::Value)->Result<serde_json::Value,String>{
        #[cfg(target_os="android")] {self.handle.run_mobile_plugin(method,args).map_err(|e|e.to_string())}
        #[cfg(not(target_os="android"))] {let _=(method,args);Err("仅 Android 使用此接口".into())}
    }
}
pub fn init<R:Runtime>()->TauriPlugin<R>{
    Builder::new("storage").setup(|app, _api|{
        #[cfg(target_os="android")] let storage=Storage{handle:_api.register_android_plugin("com.ykzstudio.infinitynotes.storage","StoragePlugin")?};
        #[cfg(not(target_os="android"))] let storage=Storage::<R>{marker:std::marker::PhantomData};
        app.manage(storage);Ok(())
    }).build()
}
