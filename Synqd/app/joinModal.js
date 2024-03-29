import * as React from 'react';
import { View, Text, StyleSheet, useColorScheme, TouchableOpacity, TouchableWithoutFeedback, TextInput, useWindowDimensions, Alert, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Modal() {
    const theme = useColorScheme();
    const [scanned, setScanned] = React.useState(false);
    const [scanner, setScanner] = React.useState(false);
    const [hasPermission, setHasPermission] = React.useState(null);
    const [serverCode, setServerCode] = React.useState(null);
    const { height, width } = useWindowDimensions();
    const [typing, setTyping] = React.useState(false);
    const insets = useSafeAreaInsets();

    const validateAuth = async () => {
        const accessToken = await getValue("accessToken");
        const expiration = await getValue("expiration");
        let expirationTime = parseInt(expiration, 10);
        let currentTime = new Date().getTime();

        if (accessToken) {
            if (currentTime >= expirationTime) {
                refreshAccessToken();
            }
        } else {
            const userId = await getValue("userId");
            const serverCode = await getValue("serverCode");

            socket.emit('leaveServer', { serverCode: serverCode, userId: userId });

            await AsyncStorage.removeItem("serverCode");
            await AsyncStorage.removeItem("accessToken");
            await AsyncStorage.setItem("hosting", "false");
            await AsyncStorage.setItem("rejoining", "false");

            Alert.alert(
                'Authentication Error',
                'We were not able to authenticate your Spotify account. Please login again. Thank you.',
                [
                    { text: 'OK' }
                ],
                { cancelable: false }
            );

            router.replace('/');
        }
    };

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // QR Code Scanner

    const handleKeyboardDismiss = () => {
        setTyping(false);
        Keyboard.dismiss();
    };

    const getBarCodeScannerPermissions = async () => {
        const { status } = await BarCodeScanner.requestPermissionsAsync();
        setHasPermission(status === 'granted');

        console.log(status);
    }

    const handleQRScan = async ({ data }) => {
        const code = parseInt(data, 10);
        const accessToken = await getValue("accessToken");

        setScanned(true);
        setScanner(false);

        console.log("QR Code Scanned", code);


        if (!accessToken) {
            let title = "Sign In";
            let message = "Please sign in to your spotify account before trying to Host or Join a session. Thank you.";
            await sendAlert(title, message);
            return;
        }

        if (await checkServerStatus()) {
            console.log("joining");

            if (code === null) {
                await AsyncStorage.setItem("serverCode", '');

            } else {
                await AsyncStorage.setItem("serverCode", data);
            }

            router.replace('/join');

        } else {
            let title = "Oops...";
            let message = "The servers are not currently online right now. Please give our team time to fix the issues. Thank you.";
            await sendAlert(title, message);
        }

    };

    const joinRoute = async () => {

        const accessToken = await getValue("accessToken");

        if (!accessToken) {
            let title = "Sign In";
            let message = "Please sign in to your spotify account before trying to Host or Join a session. Thank you.";
            await sendAlert(title, message);
            return;
        }

        if (await checkServerStatus()) {
            console.log("joining");

            if (serverCode === null) {
                await AsyncStorage.setItem("serverCode", '');

            } else {
                await AsyncStorage.setItem("serverCode", serverCode);
            }

            router.replace('/join');

        } else {
            let title = "Oops...";
            let message = "The servers are not currently online right now. Please give our team time to fix the issues. Thank you.";
            await sendAlert(title, message);
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

    const getValue = async (key) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;

        } catch (error) {
            console.error("Get value error: ", error);
        }
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            backgroundColor: theme === 'light' ? '#FFFFFF' : '#242424'
        },
        header: {
            ...Platform.select({
                ios: {
                    paddingTop: insets.top / 3
                },
                android: {
                    paddingTop: insets.top * 2,
                },
            }),
            zIndex: 2,
            flexDirection: 'row',
            // paddingTop: insets.top / 3,
            marginLeft: insets.left,
            marginRight: insets.right,
            width: '100%',
            borderBottomWidth: 1,
            borderColor: theme === 'light' ? 'black' : 'white',
            paddingBottom: insets.top / 3,
            backgroundColor: theme === 'light' ? '#FFFFFF' : '#242424',
            shadowColor: theme == 'light' ? 'black' : 'white',
            shadowOpacity: 0.25,
            shadowRadius: 10,
            shadowOffset: {
                width: 0,
                height: 5,
            },
            elevation: 5
        },
        exitButton: {
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: 20,
        },
        code: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        input: {
            width: width * .5,
            fontSize: 30,
            borderColor: theme === 'light' ? 'black' : 'white',
            borderRadius: 30,
            borderWidth: 2,
            paddingHorizontal: 20,
            paddingVertical: 10,
            color: theme === 'light' ? 'black' : 'white',
        },
        qr: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        scanner: {
            flex: 1,
            zIndex: 1,
            position: 'absolute',
            width: width,
            height: height,
            backgroundColor: 'black',
        },
    });

    return (

        <TouchableWithoutFeedback style={styles.container} onPress={handleKeyboardDismiss}>
            <View style={styles.container} >
                <StatusBar />

                <View style={styles.header} >
                    <TouchableOpacity style={styles.exitButton} onPress={() => {
                        if (scanner) {
                            setScanner(false);
                        } else {
                            router.back();
                        }
                    }} >
                        <MaterialIcons name="arrow-back" size={30} color={theme === 'light' ? 'black' : 'white'} />
                    </TouchableOpacity>

                    <View style={{ flex: 7, alignItems: 'center' }}>
                        <Text style={{ color: theme === 'light' ? 'black' : 'white', fontWeight: 'bold', fontSize: 30 }}>{scanner ? 'Scan QR Code' : 'Join'}</Text>
                    </View>

                    <View style={styles.exitButton} />
                </View>

                {(scanner && hasPermission) && (

                    <View style={styles.scanner}>
                        <BarCodeScanner onBarCodeScanned={scanned ? undefined : handleQRScan} style={styles.scanner} />
                    </View>
                )}

                <View style={styles.code}>
                    <TextInput
                        style={styles.input}
                        placeholder={typing ? '' : 'Enter Code'}
                        placeholderTextColor={theme === 'light' ? 'black' : 'white'}
                        value={serverCode}
                        onChangeText={setServerCode}
                        returnKeyType='join'
                        keyboardAppearance={theme}
                        keyboardType='numbers-and-punctuation'
                        maxLength={6}
                        clearTextOnFocus={true}
                        onFocus={() => setTyping(true)}
                        onSubmitEditing={async () => {
                            setTyping(false);

                            if (serverCode && (serverCode.toString()).length === 6) {
                                await joinRoute();
                            }
                        }}
                        textAlign='center'
                    />
                </View>

                <Text style={{ color: theme === 'light' ? 'black' : 'white', fontSize: 17, paddingHorizontal: '3%' }} >Or</Text>

                <View style={styles.qr}>
                    <TouchableOpacity style={{ alignItems: 'center' }} onPress={async () => { setScanned(false); setScanner(true); await getBarCodeScannerPermissions() }} >
                        <MaterialIcons name="qr-code-scanner" size={100} color={theme === 'light' ? 'black' : 'white'} />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableWithoutFeedback>

    );
}
