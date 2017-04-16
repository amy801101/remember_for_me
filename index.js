'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const app = express()
const firebase = require("firebase");
const admin = require("firebase-admin");

const verifyToken = process.env.VERIFY_TOKEN;
const pageToken = process.env.PAGE_TOKEN;

// Initialize Firebase
// TODO: Replace with your project's customized code snippet
const NOTES_PATH = 'notes';
const LIST_LIMIT_COUNT = 50;
const serviceAccount = require("./remember-for-me-firebase-adminsdk-lp9fa-7812f46cb1.json"); 
const firebaseConfig = {
	credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://remember-for-me.firebaseio.com"
}
let firebaseInstance = admin.initializeApp(firebaseConfig);
let databaseInstance = null;
initialFireBase();

//
// const tag = 'test_tag';
// const sender = 'test id';
// const position = `${NOTES_PATH}/${sender}/${tag}`;
// const dataRoot = databaseInstance.ref(position);
// const result = [];

// dataRoot.limitToLast(LIST_LIMIT_COUNT).once('value', function (snapshot) {
// 	snapshot.forEach((data) => {
// 		const timestamps = data.getKey();

// 		result.push(data.val());
// 	});
// });
// console.log('show notes by tag: ', result.join("\n"));
//

app.set('port', (process.env.PORT || 5000))

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}))

// Process application/json
app.use(bodyParser.json())

// Index route
app.get('/', function (req, res) {
	res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
	if (req.query['hub.verify_token'] === verifyToken) {
		res.send(req.query['hub.challenge'])
	}
	res.send('Error, wrong token')
})

// Spin up the server
app.listen(app.get('port'), function() {
	console.log('running on port', app.get('port'))
})

// Facebook robot -------
// to post data
app.post('/webhook/', function (req, res) {
	console.log('webhook!!!!!!!!');
	let messaging_events = req.body.entry[0].messaging
	for (let i = 0; i < messaging_events.length; i++) {
		let event = req.body.entry[0].messaging[i]
		let sender = event.sender.id
		if (event.message && event.message.text) {
			let text = event.message.text
			const tag = shouldGetNotesByTags(text);

			if (tag) {	//show notes by tag
				const position = `${NOTES_PATH}/${sender}/${tag}`;
				const dataRoot = databaseInstance.ref(position);

				dataRoot.limitToLast(LIST_LIMIT_COUNT).once('value', function (snapshot) {
					const result = [];

					snapshot.forEach((data) => {
						const timestamps = data.getKey();

						result.push(data.val().text);
			  	});

			  	sendTextMessage(sender, result.join("\n"));
				});
			} else {		// write tag
				const str = text.substring(0, 200);

				sendTextMessage(sender, getTags(str).join(','));
				sendTextMessage(sender, "Text received, echo: " + str);
				writeUserData(sender, str);
			}
		}
		if (event.postback) {
			let text = JSON.stringify(event.postback)
			sendTextMessage(sender, "Postback received: "+text.substring(0, 200), token)
			continue
		}
	}
	res.sendStatus(200)
})


// recommended to inject access tokens as environmental variables, e.g.
// const token = process.env.FB_PAGE_ACCESS_TOKEN

function sendTextMessage(sender, text) {
	let messageData = { text: text };
	
	request({
		url: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {access_token:pageToken},
		method: 'POST',
		json: {
			recipient: {id:sender},
			message: messageData,
		}
	}, function(error, response, body) {
		if (error) {
			console.log('Error sending messages: ', error)
		} else if (response.body.error) {
			console.log('Error: ', response.body.error)
		}
	});
}

// initial firebase
function initialFireBase() {
 	if (!firebaseInstance) {
 		firebaseInstance = admin.initializeApp(firebaseConfig);
  }
  databaseInstance = firebaseInstance.database();
  // const dbRoot = database.ref(NOTES_PATH);
	// dbRoot.limitToLast(1).on('child_added', onChildAdded);
	
	console.log('initialFireBase finished');
}

// function onValueFetched(snapshot, previousChildKey) {
// 	const dbRoot = databaseInstance.ref(NOTES_PATH);
// 	const result = [];

// 	snapshot.forEach((data) => {
// 		const timestamps = data.getKey();

// 		result.push(data.val());
//   });

//   return result.join("\n");
// }

// e.g. writeUserData('test_id', '#test 1234');
function writeUserData(userId, text) {
  const tags = getTags(text);
  const timestamps = new Date().getTime();
  const message = {
	  text,
	};

  tags.forEach(function (tag) {
  	const position = `${NOTES_PATH}/${userId}/${tag}/${timestamps}`;

	  databaseInstance && databaseInstance.ref(position).set(message);
  });
}

function getTags(str) {
	const tagReg = /(^#| #)(\S+)/g;
	let match = tagReg.exec(str);
	const result = [];

	while (match != null) {
   // matched text: match[0]
   // match start: match.index
   // capturing group n: match[n]
  	console.log('match: ', match[2]); //match[2] is the second group
  	result.push(match[2]);
  	match = tagReg.exec(str);
	}
	return result;
}

function shouldGetNotesByTags(str) {
	const tagReg = /(show #)(\S+)/g;
	let match = tagReg.exec(str);

	return match && match[2];
}