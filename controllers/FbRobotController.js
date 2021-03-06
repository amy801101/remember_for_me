const request = require('request');
const firebase = require("firebase");
const admin = require("firebase-admin");

const verifyToken = process.env.VERIFY_TOKEN;
const pageToken = process.env.PAGE_TOKEN;

// Initialize Firebase
// TODO: Replace with your project's customized code snippet
const NOTES_PATH = 'notes';
const ALL_NOTES_PATH = 'general-notes-by-id';
const LIST_LIMIT_COUNT = 10;
const serviceAccount = require("../constants/remember-for-me-firebase-adminsdk-lp9fa-7812f46cb1.json"); 
const firebaseConfig = {
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://remember-for-me.firebaseio.com"
}
let firebaseInstance = admin.initializeApp(firebaseConfig);
let databaseInstance = null;
initialFireBase();

// for Facebook verification
exports.getWebhookToken = function (req, res) {
  if (req.query['hub.verify_token'] === verifyToken) {
    res.send(req.query['hub.challenge']);
  }
  res.send('Error, wrong token');
};


// Facebook messaging robot -------
// to post data
exports.chatting = function (req, res) {
  let messaging_events = req.body.entry[0].messaging;

  for (let i = 0; i < messaging_events.length; i++) {
    let event = req.body.entry[0].messaging[i];
    let sender = event.sender.id;

    // handle postback action
    if (event.postback && event.postback.payload) {
      console.log('postback.payload: ', event.postback.payload);
      const response = JSON.parse(event.postback.payload);
      switch (response.type) {
        case 'DELETE_NOTE_BY_ID':
          const { messageId, tag, text } = response;
          const textData = {
            message: {
              text: "遵命!~ 小的忘記了:\n" + text,
            }
          }

          removeNoteByPath(sender, tag, messageId);
          sendMessageOrAttach(sender, textData);
          break;
        default:
          break;
      }

    // handle usual message
    } else if (event.message && event.message.text) {
      console.log('message: ', event.message);
      const messageId = event.message.mid;
      const text = event.message.text;
      const attachments = event.message.attachments || [];
      let showedTag = '';
      let tags = '';
      const textData = {};

      if (showedTag = shouldGetNotesByTags(text)) { //show notes by tag
        const position = `${NOTES_PATH}/${sender}/${showedTag}`;
        const dataRoot = databaseInstance.ref(position);

        dataRoot.orderByKey().limitToLast(LIST_LIMIT_COUNT).once('value', function (snapshot) {
          let attachmentsResult = [];
          let results = [];

          snapshot.forEach((data) => {
            const messageId = data.getKey();
            const { text, attachments } = data.val();
            console.log('text: ', text);

            results.push(generateResponseTemplates(text, showedTag, messageId));
            // sendMessageOrAttach(sender, generateResponseTemplates(text, showedTag, messageId));

            if (attachments && attachments.length > 0) {
              attachmentsResult = attachmentsResult.concat(attachments);
              // template method 1: BUT TEMPLATE WILL BE MUCH SLOWER THAN TEXT
              results.push(generateGenericTemplates(attachments));
            }
          });

          /* Show all url preview together:
          if (attachmentsResult.length > 0) {
            results.push(generateGenericTemplates(attachmentsResult));
            // sendMessageOrAttach(sender, generateGenericTemplates(attachmentsResult));
          }
          */

          sendRecursively(sender, results);
        });
      } else if (tags = getTags(text)) {    // write tag
        const str = text.substring(0, 200);
        const firebaseData = {};

        firebaseData.id = messageId;
        firebaseData.text = str;

        // if contains attachments, it must be link
        if (attachments.length > 0) {
          firebaseData.attachments = attachments.map(function(attachment) {
            let pureUrl = retrievePureUrl(attachment.url);

            if (attachment.payload && attachment.payload.url) {
              pureUrl = attachment.payload.url;
            }

            if(pureUrl && firebaseData.text.indexOf(pureUrl) === -1) {
              firebaseData.text += `\n${pureUrl}`;
            }

            return {
              type: attachment.type || '',
              title: attachment.title || '',
              url: pureUrl || '',
              payload: attachment.payload || '',
            };
          });

          const previewUrl = retrievePureUrl(firebaseData.attachments[0].url);
          previewUrl && getLinkPreview(previewUrl, function(result) {
            firebaseData.attachments[0] = Object.assign({}, firebaseData.attachments[0], {
              title: result.title,
              description: result.description,
              url: result.url,
              image: result.image,
            });

            textData.message = {
              text: "小的記住了:\n" + firebaseData.text,
            }
            sendMessageOrAttach(sender, textData);
            sendMessageOrAttach(sender, generateGenericTemplates([firebaseData.attachments[0]]));
            writeUserData(sender, tags, messageId, firebaseData);
          });
        } else {
          textData.message = {
            text: "小的記住了:\n" + firebaseData.text,
          }
          sendMessageOrAttach(sender, textData);
          writeUserData(sender, tags, messageId, firebaseData);
        }
        console.log('firebaseData: ', firebaseData);

      } else { // other situation
        textData.message = {
          text: "Sorry I don't get you. Try: \n#test this is a test \nto save notes. Or Try:\n show #test.\n to show notes by tag.",
        }

        sendMessageOrAttach(sender, textData);
      }
    }
    // if (event.postback) {
    //  let text = JSON.stringify(event.postback)
    //  sendTextMessage(sender, "Postback received: " + text.substring(0, 200), token)
    //  continue
    // }
  }
  res.sendStatus(200);
};


// recommended to inject access tokens as environmental variables, e.g.
// const token = process.env.FB_PAGE_ACCESS_TOKEN

function sendMessageOrAttach(sender, data, callbackFun = null) {
  const jsonObj = Object.assign({}, {
    recipient: { id: sender }
  }, data);

  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: pageToken },
    method: 'POST',
    json: jsonObj,
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending messages: ', error)
    } else if (response.body.error) {
      console.log('Error: ', response.body.error)
    }

    if (callbackFun) {
      callbackFun();
    }
  });
}

function sendRecursively(sender, resultArr, idx = 0) {
  if (idx >= resultArr.length) {
    return;
  }

  const jsonObj = Object.assign({}, {
    recipient: { id: sender }
  }, resultArr[idx]);

  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: pageToken },
    method: 'POST',
    json: jsonObj,
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending messages: ', error)
    } else if (response.body.error) {
      console.log('Error: ', response.body.error)
    } else {
      sendRecursively(sender, resultArr, idx + 1);
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
//  const dbRoot = databaseInstance.ref(NOTES_PATH);
//  const result = [];

//  snapshot.forEach((data) => {
//    const timestamps = data.getKey();

//    result.push(data.val());
//   });

//   return result.join("\n");
// }

function writeUserData(userId, tags, messageId, firebaseData) {
  const timestamps = new Date().getTime();

  // save data to general
  const notesPosition = `${NOTES_PATH}/${userId}/${ALL_NOTES_PATH}/${timestamps}`;
  databaseInstance && databaseInstance.ref(notesPosition).set(firebaseData);

  tags.forEach(function (tag) {
    const tagPosition = `${NOTES_PATH}/${userId}/${tag}/${timestamps}`;

    // save message id to each tag
    databaseInstance && databaseInstance.ref(tagPosition).set(firebaseData);
  });
}

function removeNoteByPath(userId, tag, messageId) {
  // remove data in general
  const notesPosition = `${NOTES_PATH}/${userId}/${ALL_NOTES_PATH}/${messageId}`;
  databaseInstance && databaseInstance.ref(notesPosition).remove();

  // remove message in tag
  const tagPosition = `${NOTES_PATH}/${userId}/${tag}/${messageId}`;
  databaseInstance && databaseInstance.ref(tagPosition).remove();
}

/* str processing */
function getTags(str) {
  const tagReg = /(^#| #)([^\s\.\$\#\[\]]+)/gm;
  let match = tagReg.exec(str);
  const result = [];

  while (match != null) {
   // matched text: match[0]
   // match start: match.index
   // capturing group n: match[n]
    console.log('Match: ', match[2]); //match[2] is the second group
    result.push(match[2]);
    match = tagReg.exec(str);
  }
  return result.length > 0 ? result : null;
}

function shouldGetNotesByTags(str) {
  const tagReg = /(show #)([^\s\.\$\#\[\]]+)/g;
  let match = tagReg.exec(str);

  return match && match[2];
}

function retrievePureUrl(url) {
  const pureUrlReg = /l\.facebook\.com\S+\?u=(\S[^\&]+)/g;
  let match = pureUrlReg.exec(url);

  return (match && decodeURIComponent(match[1])) || url;
}

function getLinkPreview(url, callbackFun = null) {

  request.get({
    url: 'http://api.linkpreview.net', 
    qs: {
      key: '58fdf8948597dee0f34b734215fee701a993776c2fae4',
      q: url,
    },
    json: true,
  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      const result = body;
      callbackFun && callbackFun(result);
    }
  });
}

function generateGenericTemplates(attachments) {
  const attachmentsData = {};
  let elements = attachments.map(function(attachment) {
    const result = {
      title: attachment.title || 'No title',
      subtitle: attachment.description || 'No subtitle',
      // item_url: attachment.url,
      default_action: {
        type: 'web_url',
        url: attachment.url,
        webview_height_ratio: 'tall',
      },
    };

    if (attachment.image) {
      result.image_url = attachment.image;
    }

    return result;
  });

  attachmentsData.message = {
    attachment: {
      type: "template",
      payload:{
        template_type: "generic",
        elements,
      }
    }
  };

  return attachmentsData;   
}

function generateResponseTemplates(text, tag, messageId) {
  const responseData = {};
  const postbackJson = {
    type: 'DELETE_NOTE_BY_ID',
    tag,
    messageId,
    text,
  };
  let buttons = [
    // {
    //   type: 'web_url',
    //   url: 'https://petersapparel.parseapp.com',
    //   title: 'Show Website',
    // },
    {
      type: 'postback',
      title: `Forget this note`,
      payload: JSON.stringify(postbackJson),
    }
  ];

  responseData.message = {
    attachment: {
      type: "template",
      payload:{
        template_type: 'button',
        sharable: true,
        text,
        buttons,
      }
    }
  };

  return responseData;    
}
