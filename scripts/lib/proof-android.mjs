// Identity and Gradle build type of the public spatial proof APK.
export const PROOF_PACKAGE = "com.larrabee.homecockpit.s02proof";

// Adds an `s02Proof` build type copied from release: optimised, not
// debuggable, no minify/shrink, debug-signed, distinct application ID.
export function proofGradleInit() {
  return `gradle.beforeProject { p ->
  if (p.path == ':app') {
    p.plugins.withId('com.android.application') {
      def a = p.extensions.getByName('android')
      a.buildTypes.create('s02Proof') {
        initWith(a.buildTypes.getByName('release'))
        applicationIdSuffix '.s02proof'
        matchingFallbacks = ['release']
        debuggable false
        minifyEnabled false
        shrinkResources false
        signingConfig a.signingConfigs.getByName('debug')
        resValue 'string', 'app_name', 'Maurice S02 proof'
      }
    }
  }
}
`;
}
