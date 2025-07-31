<script setup lang="ts">
import AppLayout from "./layouts/AppLayout.vue";
import { onSocketConnected } from "./lib/utils/websocket";

onSocketConnected((socket) => {
  socket.emit("test", { message: "Hello from Vue!" });
});
</script>

<template>
  <AppLayout>
    <RouterView />
  </AppLayout>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
</style>
