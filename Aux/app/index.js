import * as React from 'react';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest, exchangeCodeAsync, refreshAsync } from 'expo-auth-session';
import pkceChallenge from 'react-native-pkce-challenge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, Text, TouchableOpacity, View, Image } from "react-native";
import LinearGradient from 'react-native-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

export default function Page() {


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // variables

    const [login, setLogin] = React.useState(true);
    const authorizationEndpoint = 'https://accounts.spotify.com/authorize';
    const tokenEndpoint = 'https://accounts.spotify.com/api/token';
    const clientId = '43d48850732744018aff88a5692d03d5';
    const scopes = ['user-read-email', 'user-read-private', 'user-read-playback-state', 'user-modify-playback-state'];
    redirectURI = makeRedirectUri({ native: 'auxapp://callback' });
    // pkce code challenge for spotify OAuth using PKCE for safety
    const challenge = pkceChallenge();
    const insets = useSafeAreaInsets();
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // on mount functions

    React.useEffect(() => {

        // function to validate the auth for spotify on app open
        const validateAuth = async () => {
            const accessToken = await getValue("accessToken");
            const expiration = await getValue("expiration");
            let expirationTime = parseInt(expiration, 10);
            let currentTime = new Date().getTime();

            // if the access token is set then check the expiratation
            // else make user log in again to get auth
            if (accessToken) {

                // if the token is not expired go to the home screen of the app
                // else refresh the access token
                if (currentTime < expirationTime) {
                    setLogin(false);
                    router.replace('/home');
                } else {
                    setLogin(false);
                    refreshAccessToken();
                }
            } else {
                setLogin(true);
            }
        };

        // calls the validation function to check the access token validity
        validateAuth();

    }, []);
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // oauth functions

    // the auth request for spotify using expo's OAuth functions
    const [request, response, promptAsync] = useAuthRequest(
        {
            clientId: clientId,
            responseType: 'code',
            scopes: scopes,
            usePKCE: true,
            redirectUri: redirectURI,
            codeChallengeMethod: 'S256',
        },
        {
            authorizationEndpoint: authorizationEndpoint
        }
    );

    // once user logs in this code is ran on attachment of the response
    React.useEffect(() => {

        // if user is logging in it will check if the response is successfull 
        // and request the exchange code from spotify
        if (login) {
            if (response?.type === 'success') {

                console.log("getting exchange");
                exchangeCode();
            }
        }
    }, [response]);

    // requesting the exchange token to get access token from spotify using the expo OAuth functions
    const exchangeCode = async () => {

        try {
            const tokenResponse = await exchangeCodeAsync(
                {
                    clientId: clientId,
                    redirectUri: redirectURI,
                    code: response.params.code,
                    extraParams: {
                        grant_type: "authorization_code",
                        code_verifier: request.codeVerifier,
                    },
                },
                {
                    tokenEndpoint: tokenEndpoint,
                }
            );

            const expirationTime = new Date().getTime() + tokenResponse.expiresIn * 1000;
            await AsyncStorage.setItem('accessToken', tokenResponse.accessToken);
            await AsyncStorage.setItem('refreshToken', tokenResponse.refreshToken);
            await AsyncStorage.setItem('expiration', expirationTime.toString());

            // validates the authorization once access token is received
            await validateAuth();

        } catch (error) {
            setLogin(true);
            console.error("Token exchange error: ", error);
        }
    };

    // function to refresh the access token from spotify using refresh token
    const refreshAccessToken = async () => {

        try {

            const refreshToken = await getValue("refreshToken");

            const refreshResponse = await refreshAsync(
                {
                    extraParams: {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        grant_type: "refresh_token",
                    },
                    clientId: clientId,
                    refreshToken: refreshToken,
                },
                {
                    tokenEndpoint: tokenEndpoint,
                }
            );

            const expirationTime = new Date().getTime() + refreshResponse.expiresIn * 1000;
            await AsyncStorage.setItem('accessToken', refreshResponse.accessToken);
            await AsyncStorage.setItem('refreshToken', refreshResponse.refreshToken);
            await AsyncStorage.setItem('expiration', expirationTime.toString());

            await validateAuth();

        } catch (error) {
            setLogin(true);
            console.error("Refresh error: ", error);
        }

    };

    // function to validate the authorization
    // checks to see if the access token is set
    // if it is then it makes the api call and takes user to the home screen
    // else it makes the user log in
    const validateAuth = async () => {
        const accessToken = await getValue("accessToken");
        const expiration = await getValue("expiration");
        let expirationTime = parseInt(expiration, 10);
        let currentTime = new Date().getTime();

        if (accessToken) {
            // if the token is not expired go to the home screen of the app
            // else refresh the access token
            if (currentTime < expirationTime) {
                setLogin(false);
                // apiCall();
                router.replace('/home');
            } else {
                setLogin(false);
                await refreshAccessToken();
            }
        } else {
            setLogin(true);
        }
    };
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // api call functions

    // function to make a user profile api call to gather necessary information for app purposes
    // stores the username, userId (unique for each user), and account status of the user
    const apiCall = async () => {
        const accessToken = await getValue("accessToken");

        await fetch('https://api.spotify.com/v1/me', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            }
        })
            .then((response) => response.json())
            .then((data) => {
                console.log("User data: ", data);
                AsyncStorage.setItem("username", data.display_name);
                AsyncStorage.setItem("userId", data.id);
                AsyncStorage.setItem("accountStatus", data.product);
            })
            .catch((error) => {
                console.log("Fetch error: ", error);
            })
    };
    /////////////////////////////////////////////////////////////////////////////////////////////////

    
    /////////////////////////////////////////////////////////////////////////////////////////////////
    // other functions

    // function to retrieve values from async storage
    const getValue = async (key) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;

        } catch (error) {
            console.error("Get value error: ", error);
        }
    };
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // screen

    // displays the login screen
    // if user clicks log in it starts the async log in functions from expo's OAuth
    return (
        <LinearGradient
			colors={['rgb(31, 31, 31)', 'rgb(31, 31, 31)']}
			start={{ x: 0, y: 0 }}
			end={{ x: 0, y: 1 }}
			style={styles.container}
		>
            <SafeAreaView style={styles.container}>
                <View style={styles.container}>
                    <TouchableOpacity style={styles.button} disabled={!request} onPress={() => { promptAsync() }}>
                        {/* <Text style={styles.button}>Login</Text> */}
                        <Image style={styles.logo} source={require("../images/spotify-logo.png")}/>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

        </LinearGradient>
        
    );
    /////////////////////////////////////////////////////////////////////////////////////////////////
}


/////////////////////////////////////////////////////////////////////////////////////////////////
// styles

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: "center",
    },
    button: {

        backgroundColor: 'black',
        borderRadius: 50,
        borderWidth: 5,
    },
    logo: {
        width: 250,
        height: 75
    }
});
/////////////////////////////////////////////////////////////////////////////////////////////////