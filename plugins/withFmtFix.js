const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Xcode 26 + clang: fmt'in consteval FMT_STRING'i derlenmiyor.
// Podfile post_install'da fmt target'in consteval'ini kapat (FMT_CONSTEVAL=bos).
const FMT_FIX = `
    installer.pods_project.targets.each do |target|
      if target.name == 'fmt'
        target.build_configurations.each do |config|
          defs = config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)']
          defs = [defs] unless defs.is_a?(Array)
          defs << 'FMT_CONSTEVAL='
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs
        end
      end
    end
`;

module.exports = function withFmtFix(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');
      if (!contents.includes("FMT_CONSTEVAL=")) {
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
