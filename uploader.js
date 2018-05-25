const { deploy } = require('sftp-sync-deploy');

let config = {
    host: 'xxxx'
    port: 2222,
    username: 'xxx',
    privateKey: 'bk.pem',
    localDir: '/home/pi/qlik/data/qvd',
    remoteDir: '/home/ec2-user/core-qdt/Apps/upload'
};

let options = {
    dryRun: false,
    exclude: [
        'node_modules',
        'src/**/*.spec.ts'
    ],
    excludeMode: 'ignore',
    forceUpload: true
};

var upload=function(){
    return new Promise((resolve, reject)=>{
        console.time("upload");
        deploy(config, options).then(() => {
            console.log('success!');
            console.timeEnd("upload");
            resolve('Success');
        }).catch(err => {
            reject(err);
            console.error('error! ', err);
        })
    })
}

exports.upload = upload;
