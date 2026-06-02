import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const manifestPath = path.join(androidDir, 'app/src/main/AndroidManifest.xml');
const gradlePath = path.join(androidDir, 'app/build.gradle');
const localPropsPath = path.join(androidDir, 'local.properties');

const SIGNING_BLOCK = `
    def keystorePropertiesFile = rootProject.file("keystore.properties")
    def keystoreProperties = new Properties()
    if (keystorePropertiesFile.exists()) {
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    }
`;

const RELEASE_SIGNING = `
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }`;

async function patchManifest(contents) {
  let next = contents;
  const replacements = [
    [
      '<meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="biomicshub_alerts_v2"/>',
      '<meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="biomicshub_alerts_v2" tools:replace="android:value"/>'
    ],
    [
      '<meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/notification_icon_color"/>',
      '<meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/notification_icon_color" tools:replace="android:resource"/>'
    ],
    [
      '<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/notification_icon"/>',
      '<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/notification_icon" tools:replace="android:resource"/>'
    ]
  ];
  for (const [from, to] of replacements) {
    if (next.includes(from) && !next.includes(to)) next = next.replace(from, to);
  }

  if (!next.includes('android:path="/oauthredirect"')) {
    next = next.replace(
      '<data android:scheme="com.biomicshub.app"/>',
      `<data android:scheme="com.biomicshub.app"/>
        <data android:scheme="com.biomicshub.app" android:path="/oauthredirect"/>
        <data android:scheme="biomicshubapp" android:path="/oauthredirect"/>`
    );
  }
  return next;
}

async function patchGradle(contents) {
  if (contents.includes('keystorePropertiesFile')) return contents;

  let next = contents.replace(
    'android {',
    `${SIGNING_BLOCK}\nandroid {`
  );

  next = next.replace(
    /signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\}\s*\}/,
    (block) => block.replace(/\}\s*$/, `${RELEASE_SIGNING}\n    }`)
  );

  next = next.replace(
    /buildTypes\s*\{\s*debug\s*\{[\s\S]*?signingConfig[^\n]+\n\s*\}\s*release\s*\{[\s\S]*?signingConfig[^\n]+\n/,
    `buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug
`
  );

  return next;
}

async function ensureLocalProperties() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || `${process.env.HOME}/Library/Android/sdk`;
  try {
    await readFile(localPropsPath, 'utf8');
  } catch {
    await writeFile(localPropsPath, `sdk.dir=${sdk}\n`, 'utf8');
    console.log('Wrote', localPropsPath);
  }
}

async function main() {
  await ensureLocalProperties();

  const manifest = await readFile(manifestPath, 'utf8');
  await writeFile(manifestPath, await patchManifest(manifest), 'utf8');
  console.log('Patched AndroidManifest.xml');

  const gradle = await readFile(gradlePath, 'utf8');
  await writeFile(gradlePath, await patchGradle(gradle), 'utf8');
  console.log('Patched app/build.gradle for Play Store signing');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
