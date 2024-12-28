import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ChatRoom from '../../screens/ChatRoom';

const Stack = createNativeStackNavigator();

export default function JoinStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="ChatRoom" 
        component={ChatRoom} 
        options={{ headerTitle: 'Chat ' }} 
      />
    </Stack.Navigator>
  );
}
