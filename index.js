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
const ALL_NOTES_PATH = 'general-notes-by-id';
const LIST_LIMIT_COUNT = 50;
const serviceAccount = require("./remember-for-me-firebase-adminsdk-lp9fa-7812f46cb1.json"); 
const firebaseConfig = {
	credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://remember-for-me.firebaseio.com"
}
let firebaseInstance = admin.initializeApp(firebaseConfig);
let databaseInstance = null;
initialFireBase();

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
		console.log('message: ', event.message);
		if (event.message && event.message.text) {
			const text = event.message.text
			const tag = shouldGetNotesByTags(text);
			const attachments = event.message.attachments || [];

			if (tag) {	//show notes by tag
				const position = `${NOTES_PATH}/${sender}/${tag}`;
				const dataRoot = databaseInstance.ref(position);

				dataRoot.limitToLast(LIST_LIMIT_COUNT).once('value', function (snapshot) {
					const result = [];

					snapshot.forEach((data) => {
						const timestamps = data.getKey();

						result.push(data.val().text);
			  	});

			  	sendMessageOrAttach(sender, result.join("\n\n"));
				});
			} else {		// write tag
				const str = text.substring(0, 200);
				const messageData = {};
				let testData = {};
				
				if (attachments.length > 0) {
					testData.message = {
    				attachment:{
      				type: "template",
      				payload:{
	        			template_type:"generic",
	        			elements:[
	        				{
				            title:"Welcome to Peter\'s Hats",
				            image_url:"https://scontent-hkg3-1.xx.fbcdn.net/v/t1.0-9/18033581_1463213217064537_6590885616952603244_n.png?oh=725346ebedcaa2d7c9b188b6d6d0b217&oe=594FDE2A",
				            subtitle:"We\'ve got the right hat for everyone.",
				            default_action: {
				              type: "web_url",
				              url: "https://www.facebook.com/WangDongsDramaTalk/photos/a.675504505835416.1073741828.675375152515018/1463213217064537/?type=3&permPage=1",
				              //messenger_extensions: true,
				              webview_height_ratio: "tall",
				              fallback_url: "https://peterssendreceiveapp.ngrok.io/"
				            },
				          }
	        			],
        			}
        		}
        	};

					const attachment = attachments[0];
					messageData.message = {
						attachment: {
							type: attachment.type,
							payload: {
								title: attachment.title,
								url: attachment.url
							}
						}
					};
				} else {
					messageData.message = {
						text: str
					};
				}
				console.log('testData: ', testData);
				// const response = Object.assign({}, messageData, { 
				// 	text: "小的記住了:\n" + str,
				// });

				// writeUserData(sender, messageData);
				sendMessageOrAttach(sender, testData);
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

function sendMessageOrAttach(sender, data) {
	// let messageData = { text };
	// if (attachments) {
	// 	const attachment = attachments[0];

	// 	messageData.attachment = {
	// 		type: attachment.type,
	// 		payload: {
	// 			title: attachment.title,
	// 			url: attachment.url,
	// 		},
	// 	}; 
	// 	// can only sent at most one attachment
	// } 
	
	const jsonObj = Object.assign({}, {
		recipient: { id: sender }
	}, data);

	request({
		url: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {access_token:pageToken},
		method: 'POST',
		json: jsonObj,
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
function writeUserData(userId, messageData) {
	const { text } = messageData;
  const tags = getTags(text);
  const timestamps = new Date().getTime();

  // save data to general
  const notesPosition = `${NOTES_PATH}/${userId}/${ALL_NOTES_PATH}/${timestamps}`;
  databaseInstance && databaseInstance.ref(notesPosition).set(messageData);
  tags.forEach(function (tag) {
  	const tagPosition = `${NOTES_PATH}/${userId}/${tag}/${timestamps}`;

  	// save message id to each tag
	  databaseInstance && databaseInstance.ref(tagPosition).set(messageData);
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