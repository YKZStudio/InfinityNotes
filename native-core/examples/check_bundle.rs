use std::path::PathBuf;
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let archive = PathBuf::from(&args[1]);
    let public = std::fs::read_to_string(&args[2]).unwrap();
    let output = PathBuf::from(&args[3]);
    let watermark = args[4].parse().unwrap();
    match infinity_native_core::extract_verified(&archive, &output, &public, watermark) {
        Ok(version) => {
            infinity_native_core::verify_directory(&output, &public).unwrap();
            println!("verified version {version}")
        }
        Err(e) => {
            eprintln!("rejected: {e}");
            std::process::exit(1)
        }
    }
}
