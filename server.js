const express = require('express');
const path = require('path');
const app = express();

// Allow window.print() through Railway's proxy
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'print=*');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CSA Scheduler running on port ${PORT}`));
