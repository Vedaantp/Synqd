For latest build:
eas build:run -p ios --latest

For list of all builds:
eas build:run -p ios

For building simulator:
eas build --profile development-simulator --platform ios
eas build --profile development --platform ios
eas build --profile development --platform android

Future Features:
1) Make it so if there is less than 3 users in server it doesnt do vote phase but instead adds all songs to queue
2) Make it so host can choose how long the searching and voting phases are
3) Make it so host can kick people out of server
4) Make it so if there is a tie it adds all songs that were tied into the queue
