import React, { useState, useEffect } from "react";
import { Text, TextInput, Button, View } from "react-native";

const Welcome = ({ navigation }) => {
  const [name, setName] = useState('');
  const [submittedName, setSubmittedName] = useState('');

  useEffect(() => {
    if (localStorage.getItem('name')) {
      navigation.navigate('ChatRoom');  // Navigate to the chat room if a name is stored
    }
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 30, fontWeight: 'bold' }}>Welcome to Live Chatting</Text>

      {submittedName ? (
        <Text style={{ fontSize: 20 }}>Hello, {submittedName}!</Text>
      ) : (
        <>
          <Text style={{ fontSize: 20 }}>Please Add your Name Before Joining</Text>
          <TextInput
            placeholder="Enter your name"
            value={name}
            onChangeText={setName}
            style={{
              borderWidth: 1,
              padding: 10,
              margin: 20,
              width: 200,
              textAlign: 'center',
              fontSize: 18
            }}
          />
          <Button
            title="Get In"
            onPress={() => {
              setSubmittedName(name);
              localStorage.setItem('name', name);
              setTimeout(() => {
                navigation.navigate('ChatRoom');  // Navigate to the ChatRoom screen
              }, 2000);
            }}
          />
        </>
      )}
    </View>
  );
};

export default Welcome;
