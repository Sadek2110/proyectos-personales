import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e', fullyParallel:false, workers:1, reporter:'list',
  use:{baseURL:'http://127.0.0.1:3100', headless:true, trace:'retain-on-failure'},
  webServer:{command:'npm start',url:'http://127.0.0.1:3100/api/status',reuseExistingServer:false,env:{PORT:'3100',HOST:'127.0.0.1',DATABASE_PATH:':memory:',ADMIN_TOKEN:'browser-test-admin',GEMINI_API_KEY:'',GEMINI_MODEL:''}}
});
