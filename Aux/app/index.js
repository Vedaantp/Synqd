import * as React from 'react';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest, exchangeCodeAsync, refreshAsync } from 'expo-auth-session';
import pkceChallenge, { verifyChallenge } from 'react-native-pkce-challenge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from 'expo-router';
import { get } from 'react-native/Libraries/TurboModule/TurboModuleRegistry';

WebBrowser.maybeCompleteAuthSession();

const authorizationEndpoint = 'https://accounts.spotify.com/authorize';
const tokenEndpoint = 'https://accounts.spotify.com/api/token';

const clientId = '43d48850732744018aff88a5692d03d5';
const scopes = ['user-read-email', 'playlist-modify-public'];
redirectURI = makeRedirectUri({native: 'auxapp://callback'});
const challenge = pkceChallenge();

const getValue = async (key) => {
  try {
    const value = await AsyncStorage.getItem(key);
    return value;

  } catch (error) {
    console.error("Get value error: ", error);
  }
};

export default function Page() {

  const [login, setLogin] = React.useState(false);

  React.useEffect(() => {

    const validateAuth = async () => {
      const accessToken = await getValue("accessToken");
      const expiration = await getValue("expiration");
      let expirationTime  = parseInt(expiration, 10);
      let currentTime = new Date().getTime();

      if (accessToken) {
        if (currentTime < expirationTime) {
          setLogin(false);
          router.replace('/login');
        } else {
          setLogin(false);
          refreshAccessToken();
        }
      } else {
        setLogin(true);
      }
    };

    validateAuth();

  }, []);

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: clientId,
      responseType: 'code',
      scopes: scopes,
      usePKCE: true,
      redirectUri: redirectURI,
      codeChallengeMethod: 'S256',
      codeChallenge: challenge.codeChallenge,
    },
    {
      authorizationEndpoint: authorizationEndpoint
    }
  );

  React.useEffect(() => {
    if (login) {
      if (response?.type === 'success') {

        exchangeCode(response.params.code, request.codeVerifier);
        
      }
    }
  }, [response]);

  const exchangeCode = async (code, code_verifier) => {
    try {

      const tokenResponse = await exchangeCodeAsync(
        {
          clientId: clientId,
          redirectUri: redirectURI,
          code: code,
          extraParams: {
            grant_type: "authorization_code",
            code_verifier: code_verifier,
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

    } catch (error) {
      setLogin(true);
      console.error("Token exchange error: ", error);
    }
  };

  const refreshAccessToken = async () => {

    const validateAuth = async () => {
      const accessToken = await getValue("accessToken");

      if (accessToken) {
        setLogin(false);
        router.replace('/login');
      } else {
        setLogin(true);
      }
    };

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

      validateAuth();

    } catch (error) {
      setLogin(true);
      console.error("Refresh error: ", error);
    }

  };


  return (
    <View style={styles.container}>
      <TouchableOpacity disabled={!request} onPress={() => { promptAsync() }}>
        <Text style={ styles.button }>Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: "center",
  },
  button: {
    fontWeight: "bold",
    fontSize: 25,
    color: "green",
  },
});
