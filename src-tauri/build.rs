fn main() {
    tauri_build::build();
    link_manifest_for_tests();
}

#[cfg(windows)]
fn link_manifest_for_tests() {
    // tauri_build 只把含 Common-Controls v6 的清单链接到 bin；测试 exe 缺它会加载
    // comctl32 v5，找不到 tao 导入的 TaskDialogIndirect，启动即 0xC0000139。
    // 本包没有 tests/ 目标，rustc-link-arg-tests 会被 cargo 拒绝，只能用全局 arg。
    // 已知上限：bin 链接行上该 .a 出现两次，ld 按符号提取，实际无重复节区。
    let resource = std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("libresource.a");
    if resource.exists() {
        println!("cargo:rustc-link-arg={}", resource.display());
    }
}

#[cfg(not(windows))]
fn link_manifest_for_tests() {}
