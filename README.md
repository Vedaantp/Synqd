# About the App
This app allows users to either host or join a session where members of a session can request and vote on
songs to add to the host's Spotify queue. The songs are automatically added to the host's queue. To host a session, 
a user must be a Spotify Premium member. To join a session, a user must be logged into their spotify account, free or 
premium. The app shows the current song playing (the host has playback control), the host's queue, a list of songs that were
requested with the amount of votes for each song, and users are able to search for songs within the app. Sessions are limited
to a maximum of 5 users including the host currently.

# Get the app here
The app is available in US and Canada markets in the IOS App Store.
https://apps.apple.com/us/app/synqd/id6476221500

# Tools
For this app, I used Expo React Native as my framework. I used many react native and expo libraries to aid
the creation of this app. To see more please look at the package.json for details about libraries used. 

This app is connected to a Node JS server I created, which is hosted on Heroku. For more information about the server please visit:
https://github.com/Vedaantp/SynqdServer
