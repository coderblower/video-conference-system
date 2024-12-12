import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import Welcome from './src/page/Welcome'

// Screens
const HomeScreen = ({ navigation }) => (
  <View style={styles.container}>
    <Welcome />
    <Text>Welcome to the Home Screen!</Text>
    <Text style={styles.link} onPress={() => navigation.navigate('Details')}>
      Go to Details Screen
    </Text>
    <StatusBar style="auto" />
  </View>
);

const DetailsScreen = ({ navigation }) => (
  <View style={styles.container}>
    <Text>This is the Details Screen.</Text>
    <Text style={styles.link} onPress={() => navigation.goBack()}>
      Go Back
    </Text>
    <StatusBar style="auto" />
  </View>
);

// Navigation Setup
const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Details" component={DetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    color: 'blue',
    marginTop: 10,
    textDecorationLine: 'underline',
  },
});
