import * as React from 'react';
import { View, Text, StyleSheet, useColorScheme, useWindowDimensions, StatusBar, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import io from 'socket.io-client';
import Divider from "./divider";


export default function Modal() {

    const [loaded, setLoaded] = React.useState(false);
    const theme = useColorScheme();
    const {height, width} = useWindowDimensions();
    const [socket, setSocket] = React.useState(null);
    const [queueList, setQueueList] = React.useState(null);
    const insets = useSafeAreaInsets();
    const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';

    React.useEffect(() => {

        const theSocket = io(serverUrl);
        setSocket(theSocket);

        const getSessionInfo = async () => {
            const serverCode = await getValue('serverCode');

            theSocket.emit("joinServerCode", { serverCode: serverCode });

        };

        const getQueue = async () => {
            const serverCode = await getValue('serverCode');

            theSocket.emit("queueList", {serverCode: serverCode});
        };

        getSessionInfo();

        theSocket.on("connectedToCode", (data) => {
            getQueue();
        });

        theSocket.on("queueListUpdate", ({songs}) => {
            setQueueList(songs);
            setLoaded(true);
        });

        return (() => {
            theSocket.disconnect();
        });
    }, []);

    const getValue = async (key) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;

        } catch (error) {
            console.error("Get value error: ", error);
        }
    };

    const sliceData = (data, minSlice, isArray) => {
        if (data.length > minSlice) {
            if (isArray) {
                return data.slice(0, minSlice).join(', ') + ', ...';
            } else {
                return data.slice(0, minSlice) + ' ...';
            }
            
        } else {
            if (isArray) {
                return data.join(', ');
            } else {
                return data;
            }
        }
    };

    /////////////////////////////////////////////////////////////////////////////////////////////////

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
            flexDirection: 'row',
            // paddingTop: insets.top / 3,
            marginLeft: insets.left, 
            marginRight: insets.right, 
            alignItems: 'center',
            width: '100%',
            borderBottomWidth: 1,
            borderColor: theme === 'light' ? 'black' : 'white',
            paddingBottom: insets.top / 3,
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
        },
        searchList: {
            flex: 1,
            width: '100%',
            paddingHorizontal: '5%',
        },
        searchSongInfo: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            paddingVertical: '3%',
        },
        smallAlbumCover: {
            width: 0.125 * width,
            height: 0.125 * width,
        },
        songInfo: {
            flexDirection: 'column',
            paddingHorizontal: '5%'
        },
    });

  return (

    <View style={styles.container}>
        <StatusBar />

        <View style={styles.header} >
            <TouchableOpacity style={styles.exitButton} onPress={() => router.back()} >
                <MaterialIcons name="arrow-back" size={30} color={theme === 'light' ? 'black' : 'white'} />
            </TouchableOpacity>

            <View style={{ flex: 7, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: theme === 'light' ? 'black' : 'white', fontWeight: 'bold', fontSize: 30}}>Queue</Text>
            </View>

            <View style={styles.exitButton} />
        </View>

        { !loaded ? (
                <View style={{flex: 1, justifyContent: 'center'}}>
                    <ActivityIndicator size={'large'} color={theme === 'light' ? 'black' : 'white'} />
                </View>

            ): (

                <ScrollView contentContainerStyle={{paddingBottom: insets.bottom}} scrollsToTop={true} showsVerticalScrollIndicator={true} style={styles.searchList}>
                    { queueList && queueList.map((item, index) => (
                        <TouchableOpacity activeOpacity={1} style={{flexDirection: 'column', width: '100%'}} key={index} >
                            <TouchableOpacity activeOpacity={1} style={styles.searchSongInfo} >
                                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                    <Image style={styles.smallAlbumCover} source={{uri: item.image}} />

                                    <View style={styles.songInfo}>
                                        <Text style={{fontWeight: 'bold', color: theme === 'light' ? 'black' : 'white'}} >{sliceData(item.name, 30, false)}</Text>
                                        <Text style={{fontWeight: '500', color: theme === 'light' ? 'black' : 'white'}} >{sliceData(item.artists, 2, true)}</Text>
                                    </View>

                                </View>
                            </TouchableOpacity>
                            <Divider startX={0} endX={1} colorsArray={ theme === 'light' ? ['#FFFFFF', '#000000', '#FFFFFF'] : ['#000000', '#FFFFFF', '#000000'] }/>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

            )}
        
    </View>
        
  );
}
