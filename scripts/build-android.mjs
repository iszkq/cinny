import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.ANDROID_HOME ?? path.join(homedir(),'Library/Android/sdk');
const javaHome = process.env.JAVA_HOME;
if (!javaHome) throw new Error('请设置 JAVA_HOME，使用 JDK 21。');
const env = {...process.env,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,VITE_ANDROID_APP:'true'};
const run=(command,args,cwd=root)=>{
  const result=spawnSync(command,args,{cwd,env,stdio:'inherit'});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`${command} failed (${result.status})`);
};
if(!env.ANDROID_KEYSTORE_PATH){
  const privateDir=path.join(homedir(),'.local/share/calculator-android-signing');
  mkdirSync(privateDir,{recursive:true,mode:0o700});
  const credentialsFile=path.join(privateDir,'signing.json');
  let credentials;
  if(existsSync(credentialsFile)) credentials=JSON.parse(readFileSync(credentialsFile,'utf8'));
  else {
    credentials={alias:'calculator',password:randomBytes(32).toString('base64url')};
    writeFileSync(credentialsFile,JSON.stringify(credentials),{mode:0o600});
  }
  env.ANDROID_KEYSTORE_PATH=path.join(privateDir,'calculator-release.jks');
  env.ANDROID_KEY_ALIAS=credentials.alias;
  env.ANDROID_KEYSTORE_PASSWORD=credentials.password;
  env.ANDROID_KEY_PASSWORD=credentials.password;
  if(!existsSync(env.ANDROID_KEYSTORE_PATH)){
    run(path.join(javaHome,'bin/keytool'),['-genkeypair','-keystore',env.ANDROID_KEYSTORE_PATH,'-alias',credentials.alias,
      '-storepass:env','ANDROID_KEYSTORE_PASSWORD','-keypass:env','ANDROID_KEY_PASSWORD','-keyalg','RSA','-keysize','3072',
      '-validity','10000','-dname','CN=Calculator Android, OU=Local Release']);
    chmodSync(env.ANDROID_KEYSTORE_PATH,0o600);
  }
}
if(!process.argv.includes('--native-only')) run('npm',['run','android:sync']);
chmodSync(path.join(root,'android/gradlew'),0o755);
run('./gradlew',[':app:assembleRelease',':app:lintRelease','--console=plain'],path.join(root,'android'));
const source=path.join(root,'android/app/build/outputs/apk/release/app-release.apk');
if(!existsSync(source)) throw new Error('没有找到签名的 Release APK。');
run(path.join(sdk,'build-tools/36.0.0/apksigner'),['verify','--verbose',source]);
const {version}=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
const outputDir=path.resolve(root,'../安装包');mkdirSync(outputDir,{recursive:true});
const output=path.join(outputDir,`Calculator_${version}_build21_Android7.apk`);
copyFileSync(source,output);
console.log(`已生成签名 APK：${output}`);
