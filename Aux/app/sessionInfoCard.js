import * as React from 'react';
import { View, Alert, StatusBar, Text, StyleSheet, useColorScheme, useWindowDimensions, TouchableOpacity, TouchableWithoutFeedback, Modal, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import io from 'socket.io-client';
import Divider from "./divider";
import AsyncStorage from '@react-native-async-storage/async-storage';

function TimeDisplay({ style, hours, minutes, seconds }) {
    const formatTime = (hours, minutes, seconds) => {

        return `${hours < 1 ? '' : `${hours}:`}${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    return (
        <Text style={style}>{formatTime(hours, minutes, seconds)}</Text>
    );
}

export default function Card() {
    const [loaded, setLoaded] = React.useState(false);
    const theme = useColorScheme();
    const [showQRCode, setShowQRCode] = React.useState(false);
    const {height, width} = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const [theServerCode, setServerCode] = React.useState(null);
    const [userList, setUserList] = React.useState(null);
    const [socket, setSocket] = React.useState(null);
    const [timeElapsed, setTimeElapsed] = React.useState(null);
    const [hosting, setHosting] = React.useState(false);
    const [userId, setUserId] = React.useState(null);
    const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';
    let sessionTimer = null

    /////////////////////////////////////////////////////////////////////////////////////////////////

    React.useEffect(() => {

        const theSocket = io(serverUrl);
        setSocket(theSocket);

        const getSessionTimer = async () => {
            const serverCode = await getValue('serverCode');

            theSocket.emit("sessionTime", { serverCode: serverCode }); 

        };

        const getSessionInfo = async () => {
            const serverCode = await getValue('serverCode');
            const hosting = await getValue("hosting");
            const userId = await getValue("userId");

            setServerCode(serverCode);
            setHosting(hosting);
            setUserId(userId);

            theSocket.emit("joinServerCode", { serverCode: serverCode });
            theSocket.emit("sessionTime", { serverCode: serverCode }); 

        };

        getSessionInfo();

        theSocket.on('updateUsers', (data) => {

            let users = data.users.map((item) => item);
            users.unshift(data.host);

            setUserList(users);
            setLoaded(true);

            if (sessionTimer === null) {
                sessionTimer = setInterval(() => getSessionTimer(), 1000);
            }

        });

        theSocket.on("currentSessionTime", (data) => {
            setTimeElapsed(data);
        });

        return() => {
            clearInterval(sessionTimer);
            theSocket.disconnect();
        };

    }, []);

    React.useEffect(() => {
        console.log(hosting);
    }, [hosting]);

    const leaveServer = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");
        
        if (socket) {
            socket.emit('leaveServer', { serverCode: serverCode, userId: userId });
        }

        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");

    };

    const kickUser = async (kickId) => {
        const serverCode = await getValue("serverCode");

        if (hosting && socket) {
            socket.emit('leaveServer', {serverCode: serverCode, userId: kickId});
        }

    };

    const askLeave = async () => {
        if (hosting === 'true') {

            Alert.alert(
                "End Session?",
                "",
                [
                    {
                        text: "No",
                        style: "cancel",
                        onPress: () => {
                            
                        },
                    },
                    {
                        text: "Yes",
                        onPress: async () => {
                            await leaveServer();
                        },
                    },
                ],
                { cancelable: false }
            );

        } else {

            Alert.alert(
                "Leave Session?",
                "Leaving will not end the session",
                [
                    {
                        text: "No",
                        style: "cancel",
                        onPress: () => {
                            
                        },
                    },
                    {
                        text: "Yes",
                        onPress: async () => {
                            await leaveServer();
                        },
                    },
                ],
                { cancelable: false }
            );

        }
        
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
			backgroundColor: theme === 'light' ? '#FFFFFF' : '#242424',
		},
        header: {
            ...Platform.select({
                ios: {
                  paddingTop: insets.top
                },
                android: {
                    paddingTop: insets.top * 2,
                },
            }),
            flexDirection: 'row',
            // paddingTop: insets.top,
            marginLeft: insets.left, 
            marginRight: insets.right, 
            alignItems: 'center',
            width: '100%',
            borderBottomWidth: 1,
            borderColor: theme === 'light' ? 'black' : 'white',
            paddingBottom: "3%",
            backgroundColor: theme === 'light' ? '#FFFFFF': '#242424',
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
            paddingHorizontal: 10,
            justifyContent: 'center'
        },
        main: {
            flex: 1, 
            width: '100%',
        },
        sessionInfo: {
            flexDirection: "row",
            width: '100%',
            alignItems: 'center',
            paddingVertical: '5%'
        },
        qrCode: {
            position: 'absolute',
            flexDirection: 'row',
            alignSelf: 'center',
            justifyContent: 'center', 
            alignItems: 'center',
            top: '25%',
            width: 0.75 * width,
            height: 0.75 * width,
            backgroundColor: theme === 'light' ? 'black' : 'white',
            borderRadius: 50,

            ...Platform.select({
                ios: {
                  shadowColor: theme == 'light' ? 'black' : 'white',
                  shadowOpacity: 0.75,
                  shadowRadius: 10,
                  shadowOffset: {
                    width: 0,
                    height: 5,
                  },
                },
                android: {
                  elevation: 5,
                },
            })
        },
        userHeader: {
            flexDirection: "row",
            width: '100%',
            alignItems: 'center',
            paddingVertical: '5%'
        },
        userInfo: {
            flexDirection: 'column',
            width: '100%',
            alignItems: 'flex-start',
        },
        endSessionButton: {
            marginBottom: '15%',
            paddingHorizontal: '2%',
            paddingVertical: '2%',
            borderRadius: 50,
            borderWidth: 1,
            backgroundColor: 'red',
            borderColor: 'red'
        },
    });

  return (

    <View style={styles.container}>
        <StatusBar />

        <Modal
            animationType="fade"
            transparent={true}
            visible={showQRCode}
        >  
            <TouchableWithoutFeedback onPress={() => setShowQRCode(false)}>
                <View style={{ flex: 1 }} />
            </TouchableWithoutFeedback>

            {theServerCode && (
                <View style={styles.qrCode}>
                    <QRCode value={theServerCode} size={width * 0.65}/>
                </View>
            )}

        </Modal>

        <View style={styles.header} >
            <TouchableOpacity style={styles.exitButton} onPress={() => router.back()} >
                <MaterialIcons name="arrow-back" size={30} color={theme === 'light' ? 'black' : 'white'} />
            </TouchableOpacity>

            <View style={{ flex: 7, alignItems: 'center' }}>
                <Text style={{ color: theme === 'light' ? 'black' : 'white', fontWeight: 'bold', fontSize: 30}}>Session Info</Text>
            </View>

            <View style={styles.exitButton} />
        </View>

            
            { !loaded ? (
                <View style={{flex: 1, justifyContent: 'center'}}>
                    <ActivityIndicator size={'large'} color={theme === 'light' ? 'black' : 'white'} />
                </View>

            ): (
                <>
                <View style={styles.main}>
                    <View style={styles.sessionInfo}>
                        <TouchableOpacity onPress={() => setShowQRCode(true)} style={{ flexDirection: 'row', marginRight: 'auto', alignItems: 'center'}}>
                            <Text style={{ color: theme === 'light' ? 'black' : 'white', fontSize: 20, paddingLeft: '5%', paddingRight: '1%' }}>{theServerCode ? theServerCode : 'N/A'}</Text>
                            { theServerCode && (
                                <QRCode value={theServerCode} size={20}/>
                            )}
                        </TouchableOpacity>
                        
                        {timeElapsed ? (
                            <TimeDisplay style={{ color: theme === 'light' ? 'black' : 'white', fontSize: 20, paddingRight: '5%' }} hours={timeElapsed.hours} minutes={timeElapsed.minutes} seconds={timeElapsed.seconds} />
                        ) : (
                            <Text style={{ color: theme === 'light' ? 'black' : 'white', fontSize: 20, paddingRight: '5%' }} >N/A</Text>
                        )}
                    </View>

                    <Divider startX={0} endX={1} colorsArray={ theme === 'light' ? ['#FFFFFF', '#000000', '#FFFFFF'] : ['#000000', '#FFFFFF', '#000000'] }/>

                    <View style={styles.userHeader}>
                        <Text style={{ color: theme === 'light' ? 'black' : 'white', fontSize: 20, paddingLeft: '5%', marginRight: 'auto' }} >Users:</Text>
                        <Text style={{ color: theme === 'light' ? 'black' : 'white', fontSize: 20, paddingRight: '5%' }} >{userList ? userList.length : 0}/5</Text>
                    </View>

                    <Divider startX={0} endX={1} colorsArray={ theme === 'light' ? ['#FFFFFF', '#000000', '#FFFFFF'] : ['#000000', '#FFFFFF', '#000000'] }/>

                    <View style={styles.userInfo}>

                        {userList && userList.map((user, index) => (
                            <View style={styles.userInfo} key={index}>
                                <View style={{flexDirection: 'row', alignItems: 'center', width: '100%', paddingRight: '5%'}}>
                                    <Text style={{ marginRight: 'auto', color: theme === 'light' ? 'black' : 'white', fontSize: 17, paddingLeft: '5%', marginRight: 'auto', paddingVertical: '5%'}}>{user.username}</Text>
                                    { hosting === 'true' && user.userId !== userId ? (
                                        <TouchableOpacity onPress={() => kickUser(user.userId)}>
                                            <Ionicons name="person-remove-outline" size={25} color={theme === 'light' ? 'black' : 'white'} />
                                        </TouchableOpacity>
                                    ) : (
                                        <Text />
                                    )}
                                </View>
                                
                                <Divider startX={0} endX={1} colorsArray={ theme === 'light' ? ['#FFFFFF', '#000000', '#FFFFFF'] : ['#000000', '#FFFFFF', '#000000'] }/>
                            </View>
                        ))}

                    </View>

                </View>

                { hosting === 'true' ? (
                    <TouchableOpacity onPress={async () => await askLeave()} style={styles.endSessionButton}>
                        <Text style={{color: 'white', fontSize: 15, fontWeight: 'bold'}}>End Session</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity onPress={async () => await askLeave()} style={styles.endSessionButton}>
                        <Text style={{color: 'white', fontSize: 15, fontWeight: 'bold'}}>Leave Session</Text>
                    </TouchableOpacity>
                )}

                </>

            )}

    </View>        
  );
}
