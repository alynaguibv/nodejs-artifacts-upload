```
This is to download CMS files and update them to project CMS files, produce an APK using provided command, upload it to dropbox and post the link to Slack channel #android-team.

1- Download CMS files using versionFileURL property which is defined in properties.props file.
2- Remove build folder.
3- Produce an APK using commandToAssembleAPK property which defined in properties.props file.
4- Search for APK file in project directory.
5- Upload assembled APK to dropbox.
6- Send APK file link to dropbox through #android-team channel.

HINTs: 
1- To setup project folder, just set projectDirectory property in properties.props file.
2- You have to run "npm install" command once you checkout the repo to install NodeJS dependencies.
```
