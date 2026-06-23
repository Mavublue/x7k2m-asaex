const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Xcode 26 + clang: fmt'in consteval FMT_STRING'i derlenmiyor.
// Podfile post_install'a fmt target için FMT_CONSTEVAL=constexpr enjekte et.
const FMT_FIX = `
    installer.pods_project.targets.each do |target|
      if target.name == 'fmt'
        target.build_configurations.each do |config|
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_CONSTEVAL=constexpr'
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
      if (!contents.includes('FMT_CONSTEVAL=constexpr')) {
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
