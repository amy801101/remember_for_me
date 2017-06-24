'use strict'

const express = require('express');
var path = require('path');
const bodyParser = require('body-parser');
const app = express();

const index = require('./routes/index');
const webhook = require('./routes/webhook');

app.set('port', (process.env.PORT || 5000))
// Process application/json
app.use(bodyParser.json())
// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}))
// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', index);
app.use('/webhook', webhook);

// Spin up the server
app.listen(app.get('port'), function() {
	console.log('running on port', app.get('port'))
})

module.exports = app;