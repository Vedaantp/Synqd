import * as React from 'react';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest, exchangeCodeAsync, refreshAsync } from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, Text, TouchableOpacity, View, Image, StatusBar, useColorScheme, Alert } from "react-native";
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import io from 'socket.io-client';
import { MaterialIcons } from '@expo/vector-icons';

WebBrowser.maybeCompleteAuthSession();

export default function Page() {

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // variables
    const [login, setLogin] = React.useState(true);
    // const [firstLoad, setFirstLoad] = React.useState(true);
    const [loading, setLoading] = React.useState(true);
    const [accountStatus, setAccountStatus] = React.useState(false);
	const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';
    const authorizationEndpoint = 'https://accounts.spotify.com/authorize';
    const tokenEndpoint = 'https://accounts.spotify.com/api/token';
    const clientId = '43d48850732744018aff88a5692d03d5';
    const scopes = ['user-read-email', 'user-read-private', 'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing'];
    const redirectURI = makeRedirectUri({ native: 'auxapp://callback' });
    const theme = useColorScheme();
    const insets = useSafeAreaInsets();

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // on mount functions

    React.useEffect(() => {

        const validateAuth = async () => {
            const accessToken = await getValue("accessToken");
            const expiration = await getValue("expiration");
            let expirationTime = parseInt(expiration, 10);
            let currentTime = new Date().getTime();

            if (accessToken) {
                if (currentTime < expirationTime) {
                    setLogin(false);

                    await checkAccountStatus();
                    await checkRejoin();
                } else {
                    setLogin(false);
                    refreshAccessToken();
                }
            } else {
                setLogin(true);
            }
        };

        validateAuth();

        setTimeout(() => setLoading(false), 2500);

    }, []);

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // oauth functions

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

    React.useEffect(() => {

        if (login) {
            if (response?.type === 'success') {

                console.log("getting exchange");
                exchangeCode();
            }
        }
    }, [response]);

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

            await validateAuth();

        } catch (error) {
            setLogin(true);
            console.error("Token exchange error: ", error);
        }
    };

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

            const expirationTime = Date.now() + refreshResponse.expiresIn * 1000;
            await AsyncStorage.setItem('accessToken', refreshResponse.accessToken);
            await AsyncStorage.setItem('refreshToken', refreshResponse.refreshToken);
            await AsyncStorage.setItem('expiration', expirationTime.toString());

            await validateAuth();

        } catch (error) {
            setLogin(true);
            console.error("Refresh error: ", error);
        }

    };

    const validateAuth = async () => {
        const accessToken = await getValue("accessToken");
        const expiration = await getValue("expiration");
        let expirationTime = parseInt(expiration, 10);
        let currentTime = new Date().getTime();

        if (accessToken) {
            if (currentTime < expirationTime) {
                setLogin(false);

                await checkAccountStatus();
                await checkRejoin();


            } else {
                setLogin(false);
                await refreshAccessToken();
            }
        } else {
            setLogin(true);
        }
    };

    const logout = async () => {
		await AsyncStorage.setItem("accessToken", '');
		router.replace('/');
	};

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // account status functions

	async function checkAccountStatus() {

		await apiCall();

		const product = await getValue('accountStatus');

		if (product === 'premium') {
			setAccountStatus(true);
		} else {
			setAccountStatus(false);
		}

	};

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // hosting function

    const hostRoute = async () => {
        const accessToken = await getValue("accessToken");

        if (!accessToken) {
            let title = "Sign In";
            let message = "Please sign in to your spotify account before trying to Host or Join a session. Thank you.";
            await sendAlert(title, message);
            return;
        }

        if (accountStatus) {
            if (await checkServerStatus()) {
                router.replace('/host');
            } else {
                let title = "Oops...";
                let message = "The servers are not currently online right now. Please give our team time to fix the issues. Thank you.";
                await sendAlert(title, message);
            }
        } else {
            let title = "Oops...";
            let message = "You can't host a session if you are not a Premium member of Spotify.";
            await sendAlert(title, message);
        }
    };

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // joining function

    const joinRoute = async () => {
        const accessToken = await getValue("accessToken");

        if (!accessToken) {
            let title = "Sign In";
            let message = "Please sign in to your spotify account before trying to Host or Join a session. Thank you.";
            await sendAlert(title, message);
            return;
        } else {
            router.push('/joinModal')
        }
    };

    /////////////////////////////////////////////////////////////////////////////////////////////////
	// rejoin functions

	const checkRejoin = async () => {

		const oldServerCode = await getValue("serverCode");

		if (oldServerCode) {
			Alert.alert(
				"Session Found",
				"Do you want to rejoin?",
				[
					{
						text: "No",
						style: "cancel",
						onPress: () => {
							stopRejoin();
						},
					},
					{
						text: "Yes",
						onPress: () => {
							rejoin();
						},
					},
				],
				{ cancelable: false }
			);
		}
	};

	const rejoin = async () => {
		const oldServerCode = await getValue("serverCode");
		const hosting = await getValue("hosting");

		if (oldServerCode) {
			await AsyncStorage.setItem("rejoining", "true");

			if (hosting === 'true') {
				router.replace('/host');
			} else {
				router.replace('/join');
			}

		} else {
			await AsyncStorage.setItem("rejoining", "false");
		}
	};

	const stopRejoin = async () => {
		const userId = await getValue("userId");
		const username = await getValue("username");
		const hosting = await getValue("hosting");
		const oldServerCode = await getValue("serverCode");

		await AsyncStorage.removeItem("serverCode");
		await AsyncStorage.setItem("hosting", 'false');
		await AsyncStorage.setItem("rejoining", "false");

		if (oldServerCode) {
			return new Promise((resolve) => {
				const socket = io(serverUrl);

				socket.on('connect', () => {
					console.log('Connected to server');

					if (hosting === 'true') {
						socket.emit("updateHost", { username: username, userId: userId, serverCode: oldServerCode });
					} else {
						socket.emit('updateUser', { username: username, userId: userId, serverCode: oldServerCode });
					}
				});

				socket.on('updateUsers', (data) => {
					if (hosting === 'true') {
						socket.emit('end', { serverCode: oldServerCode, userId: userId });
						socket.emit('leaveServer', { serverCode: oldServerCode, userId: userId });
					} else {
						socket.emit('leaveServer', { serverCode: oldServerCode, userId: userId });
					}
				});

				socket.on('hostLeft', (data) => {
					console.log('Rejoin canceled');
					socket.disconnect();
					resolve();
				});

				socket.on('userStoppedRejoin', (data) => {
					console.log("Rejoin canceled");
					socket.disconnect();
					resolve();
				});

				socket.on('joinError', (data) => {
					console.log("Rejoin canceled");
					socket.disconnect();
					resolve();
				});

				socket.on('rejoinError', (data) => {
					console.log("Rejoin canceled");
					socket.disconnect();
					resolve();
				});

				socket.on('serverFull', (data) => {
					console.log("Rejoin canceled");
					socket.disconnect();
					resolve();
				});

			});
		}
	};

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // api call functions

    const apiCall = async () => {
        const accessToken = await getValue("accessToken");

        await fetch('https://api.spotify.com/v1/me', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            }
        })
            .then((response) => response.json())
            .then((data) => {
                console.log("Data retreived");
                AsyncStorage.setItem("username", data.display_name);
                AsyncStorage.setItem("userId", data.id);
                AsyncStorage.setItem("accountStatus", data.product);
            })
            .catch((error) => {
                console.log("Fetch error: ", error);
                AsyncStorage.removeItem("accessToken");
				AsyncStorage.removeItem("username");
				AsyncStorage.removeItem("userId");
				AsyncStorage.removeItem("accountStatus");
            })
    };

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // other functions

    const getValue = async (key) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;

        } catch (error) {
            console.error("Get value error: ", error);
        }
    };

    const checkServerStatus = async () => {
		try {
			const response = await fetch('https://aux-server-88bcd769a4b4.herokuapp.com/serverStatus');

			if (response.status === 200) {
				return true;
			} else {
				return false;
			}
		} catch (error) {
			console.error("Server status error: ", error);
			return false;
		}
	};

	const sendAlert = async (title, message) => {
		Alert.alert(
			`${title}`,
			`${message}`,
			[
				{ text: 'OK' }
			],
			{ cancelable: false }
		);
	};

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // styles

    const styles = StyleSheet.create({
		container: {
			flex: 1,
			alignItems: 'center',
			backgroundColor: theme === 'light' ? '#FFFFFF' : '#242424'
		},
		image: {
            marginTop: insets.top,
			width: 100,
			height: 100,
		},
		host: {
			flex: 2,
			justifyContent: 'center',
			alignItems: 'center',
		},
		join: {
			flex: 2,
			justifyContent: 'center',
			alignItems: 'center',
		},
		log: {
			flex: 1,
			justifyContent: 'center',
			alignItems: 'center',
		},
		text: {
			color: theme === 'light' ? 'black' : 'white',
			fontWeight: 'bold',
			fontSize: 15,
		},
        spotifyButton: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 5,
        },
        spotifyIcon: {
            width: 20,
            height: 20
        },
	});

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // screen
    
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar />

            <Image style={styles.image} source={require("../images/Synqd-Logos/Logo.png")} />

            <View style={styles.host}>
                <TouchableOpacity style={ {alignItems: 'center'} } onPress={async () => await hostRoute()} >
                    <MaterialIcons name="speaker-phone" size={75} color={theme === 'light' ? 'black' : 'white'} />
                    <Text style={styles.text} >Host</Text>
                </TouchableOpacity>
            </View>

            <Text style={{ color: theme === 'light' ? 'black' : 'white', fontSize: 17, paddingHorizontal: '3%'}} >Or</Text>

            <View style={styles.join}>
                <TouchableOpacity style={{alignItems: 'center'}} onPress={async () => await joinRoute()} >
                    <MaterialIcons name="person-add" size={75} color={theme === 'light' ? 'black' : 'white'} />
                    <Text style={styles.text} >Join</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.log}>
                <View style={styles.spotifyButton}>
                    <Image style={styles.spotifyIcon} source={require("../images/spotify-icon-green.png")} />
                    <TouchableOpacity style={styles.spotifyButton} onPress={async () => {
                        if (login) {
                            promptAsync();
                        } else {
                            await logout()
                        }
                    }}>
                        <Text style={styles.text}>{login ? 'Log In' : 'Log Out'}</Text>
                    </TouchableOpacity>
                </View>
            </View>

        </SafeAreaView>
    );
}