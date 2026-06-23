const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Xcode 26 + clang: fmt 11.0.2'nin consteval FMT_STRING'i derlenmiyor.
// FMT_USE_CONSTEVAL/FMT_CONSTEVAL makrolari korumasiz tanimlandigi icin -D ise yaramaz.
// pod install sonrasi base.h kaynagini yamala: FMT_USE_CONSTEVAL'i 0'a cek.
const FMT_FIX = `
    fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      text = File.read(fmt_base)
      text.gsub!('#  define FMT_USE_CONSTEVAL 1', '#  define FMT_USE_CONSTEVAL 0')
      File.write(fmt_base, text)
    end
`;

module.exports = function withFmtFix(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');
      if (!contents.includes('FMT_USE_CONSTEVAL 0')) {
        contents = contents.replace(
          /post_install do \|installer\|/,
          `post_install do |installer|\n${FMT_FIX}`
        );
        fs.writeFileSync(podfile, contents);
      }
      return cfg;
    },
  ]);
};
