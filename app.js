//? requiring all the dependencies
const express = require("express");
const app = express();
const fs = require('fs');
const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv").config();
const bodyParser = require('body-parser');
const session = require('express-session');
const ejs_mate = require("ejs-mate");
const methodOverride = require("method-override");
const cookieParser = require("cookie-parser");
const passport = require("passport");
//! flash module is unnecessary, to be removed later
const flash = require('connect-flash');
const multer = require('multer');
// const coinbase = require('coinbase-commerce');
const coinbase = require('coinbase-commerce-node');
const port = process.env.PORT || 3000;
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

//  const 227d1f22-9c0a-40b4-98e0-ba0d69536a08
const webhookSecret = '227d1f22-9c0a-40b4-98e0-ba0d69536a08';

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const calculatedSignature = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(calculatedSignature));
}




//?? setting up mongo session
const mongoSessionStore = require("connect-mongo")

//? creating mongo collection named mintMart
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

// Handle the Coinbase Commerce webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const payload = JSON.stringify(req.body);
    const signature = req.headers['x-cc-webhook-signature'];

    // Verify the Coinbase Commerce webhook signature
    if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
      console.error('Invalid webhook signature.');
      return res.sendStatus(400);
    }

    const event = req.body;

    // Check if the event type is 'charge:confirmed'
    if (event.type === 'charge:confirmed') {
      // Retrieve the photo_id from the metadata
      const photoId = event.data.metadata.photo_id;

      // Save the photo details to the database with paymentStatus set to 'confirmed'
      const newPhoto = new Photo({
        name: event.data.metadata.photo_name,
        description: event.data.metadata.photo_description,
        filename: photoId,
        paymentStatus: 'confirmed',
      });

      await newPhoto.save();

      console.log(`Payment for photo ${photoId} is confirmed.`);
    }
    else{
      fs.unlinkSync(req.file.path);
    }
    // Respond with a 200 OK status to acknowledge receipt of the webhook
    res.sendStatus(200);
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    res.sendStatus(500);
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
// TODO: this route has to be used for posting the NFTs on the register page.
app.get('/upload', async (req, res, next) => {
  res.render('upload.ejs');
});
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
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'photo-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
  },
});

// const upload = multer({ storage: storage });
const upload = multer({ storage: storage }).single('photo');

// Handle photo upload and payment
app.post('/upload', upload, async (req, res) => {

  // Get the user-provided name and description from the form
  const { name, description } = req.body;

  // Create a charge for $10
  const chargeData = {
    name: 'Photo Upload', // You can customize this name as needed
    description: 'Charge for photo upload',
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
  // const newPhoto = new Photo({
  //   name : req.body.name,
  //   description : req.body.description,
  //   filename : req.file.filename,
  //   paymentStatus: 'confirmed',
  // });

  // await newPhoto.save();
  //!! Create the charge
  //? deprecate hogya ye method so ignorethis 
  Charge.create(chargeData, async (err, response) => {

    try {
      //  fs.unlinkSync(req.file.path);
      res.redirect(response.hosted_url);

    } catch (error) {
      console.error('Error creating charge:', error.message);
      fs.unlinkSync(req.file.path);
      res.status(500).send('An error occurred during charge creation.');
    }
    // console.log(response.timeline[0].status);
  });


//   app.post('/webhook', async (req, res) => {
//     try {
//       const payload = JSON.stringify(req.body);
//       const signature = req.headers['x-cc-webhook-signature'];

//       // Verify the Coinbase Commerce webhook signature
//       if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
//         console.error('Invalid webhook signature.');
//         return res.sendStatus(400);
//       }

//       const event = req.body;

//       // Check if the event type is 'charge:confirmed'
//       if (event.type === 'charge:confirmed') {
//         // Retrieve the photo_id from the metadata
//         const photoId = event.data.metadata.photo_id;

//         // Update the payment status in the database for the corresponding photo
//         await Photo.findOneAndUpdate(
//           { filename: photoId },
//           { paymentStatus: 'confirmed' },
//           { new: true }
//         );

//         console.log(`Payment for photo ${photoId} is confirmed.`);
//       }

//       // Respond with a 200 OK status to acknowledge receipt of the webhook
//       res.sendStatus(200);
//     } catch (error) {
//       console.error('Error handling webhook:', error.message);
//       res.sendStatus(500);
//     }

//   });

});

// Handle the ImagePage route to display photo details
// Handle the ImagePage route to display photo details or list all photos
// Handle the ImagePage route to display photo details or list all photos
// Handle the ImagePage route to display photo details or list all photos
// app.get('/image/:photoID?', async (req, res) => {
//   try {
//     const photoId = req.params.photoID;

//     if (photoId) {
//       // If a photoID is provided, find the specific photo in the database
//       const photo = await Photo.findOne({ filename: photoId });

//       if (!photo) {
//         // If the photo is not found in the database, display an error message
//         return res.status(404).send('Photo not found.');
//       }

//       // Render the ImagePage with the photo details
//       return res.render('image', {photo});
//     } else {
//       // If no photoID is provided, retrieve all photos from the database
//       const photos = await Photo.find({});

//       // Render the ImagePage with the list of photos
//       return res.render('image', { photos });
//     }
//   } catch (error) {
//     console.error('Error retrieving photo(s):', error);
//     res.status(500).send('An error occurred while fetching photo(s).');
//   }
// });

app.get('/image', async (req, res) => {
  const photo = await Photo.find({});
res.render('image', {photo : photo});
})
app.get('/status', async (req, res) => {
  res.render('status.ejs', {photo: req.body.photo});
});
app.listen(port, () => {
  console.log('Server is running on port : 3000');
});


