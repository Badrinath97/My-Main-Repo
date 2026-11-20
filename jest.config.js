const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

module.exports = {
  ...jestConfig,
  modulePathIgnorePatterns: ["<rootDir>/.localdevserver"],
  // CSS-only LWC modules (imported with @import 'c/...') have no .js file,
  // so point Jest at the stylesheet itself.
  moduleNameMapper: {
    ...jestConfig.moduleNameMapper,
    "^c/mediaTrackerStyles$":
      "<rootDir>/force-app/main/MediaTracker/lwc/mediaTrackerStyles/mediaTrackerStyles.css"
  }
};
