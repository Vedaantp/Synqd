// AuxCordAnimation.js

import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { Easing, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const Test = () => {
  const progress = useSharedValue(0);
  const auxCordRef = useRef();

  const startAnimation = () => {
    progress.value = withTiming(1, { duration: 2000, easing: Easing.linear }, () => {
      // Animation completed
    });
  };

  const auxCordStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${progress.value * 360}deg` }],
    };
  });

  return (
    <View style={styles.container}>
      <Svg
        width={100}
        height={200}
        viewBox="0 0 100 200"
        ref={auxCordRef}
        onPress={startAnimation}
      >
        <Path
          d="M50 0 L50 150"
          fill="none"
          stroke="black"
          strokeWidth="5"
        />
        <Path
          d="M50 150 L25 175"
          fill="none"
          stroke="black"
          strokeWidth="5"
        />
        <Path
          d="M50 150 L75 175"
          fill="none"
          stroke="black"
          strokeWidth="5"
        />
      </Svg>
      <Animated.View style={[styles.plug, auxCordStyle]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plug: {
    width: 20,
    height: 20,
    backgroundColor: 'black',
    borderRadius: 10,
    position: 'absolute',
    bottom: 0,
    left: 48,
  },
});

export default Test;
