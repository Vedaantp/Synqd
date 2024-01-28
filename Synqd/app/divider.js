import React from 'react';
import { View, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const Divider = ({colorsArray, endX, startX}) => {
//   return <View style={styles.divider} />;
return <LinearGradient
        colors={colorsArray}
        start={{ x: startX, y: 0 }}
        end={{ x: endX, y: 0 }}
        style={styles.divider}
    />
};


const styles = StyleSheet.create({
  divider: {
    height: 1,
    width: '100%',
  },
});

export default Divider;
