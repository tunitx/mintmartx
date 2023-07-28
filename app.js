// ?? requiring all the dependencies
const express = require("express");
const app = express();
const fs = require('fs');
const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv").config();
const bodyParser = require('body-parser');
const session = require('express-session');
const crypto = require('crypto');
const ejs_mate = require("ejs-mate");
const methodOverride = require("method-override");
const cookieParser = require("cookie-parser");
const passport = require("passport");
const flash = require('connect-flash');
const multer = require('multer');
const coinbase = require('coinbase-commerce-node');
const port =  3000;
const Photo = require('./model');
app.use(bodyParser.json());

app.set("view engine", "ejs");
app.engine("ejs", ejs_mate);

app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use(flash());
app.use(methodOverride("_method"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_PARSER_SEC));

//?? setting up mongo session
const mongoSessionStore = require("connect-mongo")

//? creating mongo db named mintMart
async function connectToDatabase() {
  try {
    await mongoose.connect('mongodb://localhost:27017/mintMart', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB successfully!');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
  }
}
connectToDatabase();

//? webhook secret from coinbase server
const webhookSecret = 'c5b74b1b-e028-4514-aa47-d2879d783cb8';

// !! Function to verify the webhook signature
function verifyWebhookSignature(headers, rawBody, secret) {
  const signature = headers['x-cc-webhook-signature'];

  if (!signature) {
    throw new Error('Webhook signature missing in request headers.');
  }

  const hmac = crypto.createHmac('sha256', secret);
  const calculatedSignature = 'sha256=' + hmac.update(rawBody).digest('hex');
  // ** log this calculated signature and put it into the header of webhook signature while making mock webhook requests from postman to server
  console.log(calculatedSignature);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(calculatedSignature));

}
// ?? Webhook endpoint to handle Coinbase Commerce webhook
app.post('/webhook', async (req, res) => {
  try {
    console.log(req.body);
    console.log(req.headers);
    const headers = req.headers;
    const rawBody = JSON.stringify(req.body);
    //? Verify the webhook signature
    const isValidSignature = verifyWebhookSignature(headers, rawBody, webhookSecret);
    console.log(isValidSignature);

    if (!isValidSignature) {
      return res.status(400).send('Invalid webhook signature.');
    }

    const event = req.body.event;
    const type = event.type;
    const data = event.data;
    const obj = JSON.stringify(data.metadata.photoId);
    console.log(obj);
    // console.log('Metadata:', JSON.stringify(data.metadata, null, 2));
    var photoId = JSON.stringify(data.metadata.photoId);
    const photoName = JSON.stringify(data.metadata.photoName);
    const photoDescription = JSON.stringify(data.metadata.photoDescription);
    
    //* check if the payment has been confirmed and then save the metadata into your database
    if (type === 'charge:confirmed') {
      const newPhoto = new Photo({
        // name: photoName,
        name :photoName.replace(/"/g, ''),
        description: photoDescription.replace(/"/g, ''),
        filename: photoId.replace(/"/g, ''),
        paymentStatus: 'confirmed',
      });
      console.log(newPhoto);
      await newPhoto.save();
    } 

    //* if the payment is not confirmed then make sure that the photo that you added in /upload route gets removed from the /public/uploads
    else if (type === 'charge:failed' || type === 'charge:expired') {
      console.log("error block checking");
      photoId = photoId.replace(/"/g, '');
      const imagePath = path.join(__dirname, 'public', 'uploads', photoId);
      fs.unlink(imagePath, (err) => {
        if (err) {
          console.error('Error deleting the image:', err);
        } else {
          console.log('Image deleted:', photoId);
        }
      });
    }
    // ** Respond with a success status
    res.status(200).send('Webhook received and processed successfully.');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('An error occurred while processing the webhook.');
  }
});


//!!!! requiring needed gAuth configurations from config folder

require("./src/config/google");
require("./src/config/passport");

//? instantiating the a mongo session variable to store the session
const sessionStore = mongoSessionStore.create({
  collectionName: "sessions",
  mongoUrl: "mongodb://localhost:27017/mintMart",
});
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    store: sessionStore,
    cookie: {
      httpOnly: true,
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/",
    successRedirect: "/",
    failureFlash: true,
    successFlash: "Successfully logged in!",
  })
);
// TODO: this route has to be used for posting the NFTs on the upload page.
app.get('/upload', async (req, res, next) => {
  res.render('upload.ejs');
});

// ** Root route for mintMart
app.get('/', (req, res) => {
  if (!req.user) {
    return res.redirect("/auth/google");
  }
  res.render('index.ejs');
})
app.get("/auth/logout", (req, res) => {
  req.session.destroy(function () {
    res.clearCookie("connect.sid");
    res.clearCookie("signedIN");
    res.redirect("/");
  });
});

const API_KEY = '18c9bece-d339-4ccc-9efe-44fcc4a4dfa5';
const Client = coinbase.Client;
Client.init(API_KEY);
const Charge = coinbase.resources.Charge;



// Todo : Handle photo upload and payment

//?? Multer disk storage initialization
const storage = multer.diskStorage({
  //? setting up cb ( callback) as the location in which the image has to be uploaded
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  //? assigning a uniquesuffix to the filename of the uploaded file to avoid ambiguities & collisions
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'photo-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
  },
});

//! instantiating the storage object
const upload = multer({ storage: storage }).single('photo');

//todo : this is the upload route which will handle the upload requests and save the uploaded file for later processing in /webhook
app.post('/upload', upload, async (req, res) => {

  // ?? Get the user-provided name and description from the form
  const { name, description } = req.body;

  // ? Create a charge 
  const chargeData = {
    name: 'List your NFT on MintMart',
    description: 'Charge for NFT Listing',
    pricing_type: 'fixed_price',
    local_price: {
      amount: '1.00',
      currency: 'USD',
    },
    metadata: {
      photo_id: req.file.filename,
      photo_name: name,
      photo_description: description,
    },
  };

  
 //?? now the charge gets created through this function and we get a response which has a hosted url to make payments.
 //todo : redirect to the hosted_url to make payments and log the response
  Charge.create(chargeData, async (err, response) => {

    try {
      //  fs.unlinkSync(req.file.path);
      console.log(response);
      res.redirect(response.hosted_url);

    } catch (error) {
      console.error('Error creating charge:', error.message);
      fs.unlinkSync(req.file.path);
      res.status(500).send('An error occurred during charge creation.');
    }
    // console.log(response.timeline[0].status);
  });

});


//Todo : create a dynamic /image route to handle the rendered images in the database with their name and description
// !! just to make you remember for later that here Photo is the model for your 'photos' collection

app.get('/image', async (req, res) => {
  //** Here we are getting an array of JSon objects back in which each object is a single 'photo' object which has a name and description
  const photo = await Photo.find({});
  //**  we render the photo array to the /image route 
  res.render('image', { photo: photo });
})

//?? will figure out later if we need to implement this route
app.get('/status', async (req, res) => {
  res.render('status.ejs', { photo: req.body.photo });
});

//? listening on port 3000
app.listen(port, () => {
  console.log('Server is running on port : 3000');
});


