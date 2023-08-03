// ?? requiring all the dependencies
const express = require("express");
const app = express();
const fs = require("fs");
const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv").config();
const bodyParser = require("body-parser");
const session = require("express-session");
const crypto = require("crypto");
const ejs_mate = require("ejs-mate");
const methodOverride = require("method-override");
const cookieParser = require("cookie-parser");
const passport = require("passport");
const flash = require("connect-flash");
const multer = require("multer");
const coinbase = require("coinbase-commerce-node");
const port = 3000;
const Photo = require("./model");

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
const mongoSessionStore = require("connect-mongo");

//? creating mongo db named mintMart
async function connectToDatabase() {
  try {
    await mongoose.connect("mongodb+srv://tunitx:FnPe7JctlVTlhJOT@mintmart.wjhqljx.mongodb.net/?retryWrites=true&w=majority", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB successfully!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error.message);
  }
}
connectToDatabase();

// const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://tunitx:FnPe7JctlVTlhJOT@mintmart.wjhqljx.mongodb.net/?retryWrites=true&w=majority";

// // Create a MongoClient with a MongoClientOptions object to set the Stable API version
// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   }
// });

// async function run() {
//   try {
//     // Connect the client to the server	(optional starting in v4.7)
//     await client.connect();
//     // Send a ping to confirm a successful connection
//     await client.db("admin").command({ ping: 1 });
//     console.log("Pinged your deployment. You successfully connected to MongoDB!");
//   } finally {
//     // Ensures that the client will close when you finish/error
//     await client.close();
//   }
// }
// run().catch(console.dir);


// !! Function to verify the webhook signature

function verifyWebhookSignature(headers, rawBody, secret) {
  const signature = headers["x-cc-webhook-signature"];

  if (!signature) {
    throw new Error("Webhook signature missing in request headers.");
  }

  const hmac = crypto.createHmac("sha256", secret);
  const calculatedSignature = hmac.update(rawBody).digest("hex");
  // ** log this calculated signature and put it into the header of webhook signature while making mock webhook requests from postman to server
  // console.log(calculatedSignature);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(calculatedSignature)
  );
}

// ?? Webhook endpoint to handle Coinbase Commerce webhook

app.post("/webhook", async (req, res) => {
  try {
    // console.log(req.body);
    // console.log(req.headers);
    const headers = req.headers;
    const rawBody = JSON.stringify(req.body);
    //? Verify the webhook signature
    const isValidSignature = verifyWebhookSignature(
      headers,
      rawBody,
      process.env.WEBHOOK_SECRET
    );
    // console.log(isValidSignature);

    if (!isValidSignature) {
      return res.status(400).send("Invalid webhook signature.");
    }

    const event = req.body.event;
    const type = event.type;
    const data = event.data;
    // console.log(obj);
    // console.log(data.metadata);

    var photoId = JSON.stringify(data.metadata.photo_id);
    const photoName = JSON.stringify(data.metadata.photo_name);
    const photoPrice= JSON.stringify(data.metadata.photo_price);
    const photoOwner= JSON.stringify(data.metadata.photo_owner);

    //* check if the payment has been confirmed and then save the metadata into your database
    if (type === "charge:confirmed") {
      const newPhoto = new Photo({
        name: photoName.replace(/"/g, ""),
        price: photoPrice.replace(/"/g, ""),
        owner: photoOwner.replace(/"/g, ""), 
        filename: photoId.replace(/"/g, ""),
        paymentStatus: "confirmed",
      });
      // console.log(newPhoto);
      await newPhoto.save();
    }


    //* if the payment is not confirmed then make sure that the photo that you added in /upload route gets removed from the /public/uploads
    else if (type === "charge:failed" || type === "charge:expired") {
      // console.log("error block checking");
      photoId = photoId.replace(/"/g, "");
      const imagePath = path.join(__dirname, "public", "uploads", photoId);
      fs.unlink(imagePath, (err) => {
        if (err) {
          console.error("Error deleting the image:", err);
        } else {
          console.log("Image deleted:", photoId);
        }
      });
    }
    // ** Respond with a success status
    res.status(200).send("Webhook received and processed successfully.");
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send("An error occurred while processing the webhook.");
  }
});

//!!!! requiring needed gAuth configurations from config folder

require("./src/config/google");
require("./src/config/passport");

//? instantiating the a mongo session variable to store the session

const sessionStore = mongoSessionStore.create({
  collectionName: "sessions",
  mongoUrl: uri,
});
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    store: sessionStore,
    cookie: {
      httpOnly: true,
    },
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

app.get("/upload", async (req, res, next) => {
  res.render("upload.ejs");
});

// ** Root route for mintMart

app.get("/", async (req, res) => {
  
  if (!req.user) {
    return res.redirect("/auth/google");
  }
  const photo = await Photo.find({});
  //**  we render the photo array to the /image route
  res.render("index", { photo: photo });
  
});
//? for logging out te session from a google account
app.get("/auth/logout", (req, res) => {
  req.session.destroy(function () {
    res.clearCookie("connect.sid");
    res.clearCookie("signedIN");
    res.redirect("/");
  });
});

const Client = coinbase.Client;
Client.init(process.env.API_KEY);
const Charge = coinbase.resources.Charge;

// Todo : Handle photo upload and payment

//?? Multer disk storage initialization
const storage = multer.diskStorage({
  //? setting up cb ( callback) as the location in which the image has to be uploaded
  destination: function (req, file, cb) {
    cb(null, "public/uploads/");
  },
  //? assigning a uniquesuffix to the filename of the uploaded file to avoid ambiguities & collisions
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      "photo-" + uniqueSuffix + "." + file.originalname.split(".").pop()
    );
  },
});

//! instantiating the storage object

const upload = multer({ storage: storage }).single("photo");

//Todo : this is the upload route which will handle the upload requests and save the uploaded file for later processing in /webhook
app.post("/upload", upload, async (req, res) => {
  // ?? Get the user-provided name and description from the form
  const { name, price, owner } = req.body;

  // ? Create a charge
  const chargeData = {
    name: "List your NFT on MintMart",
    description: "Charge for NFT Listing, ",
    pricing_type: "fixed_price",
    local_price: {
      amount: "175.00",
      currency: "USD",
    },
    //! you will need to use this metadata in the webhook 
    metadata: {
      photo_id: req.file.filename,
      photo_name: name,
      photo_price : price,
      photo_owner: owner,
    },
  };

  //?? now the charge gets created through this function and we get a response which has a hosted url to make payments.
  //todo : redirect to the hosted_url to make payments and log the response
  Charge.create(chargeData, async (err, response) => {
    try {
      console.log(response);
      const userId = req.user.id;
      //?? for adding mock NFTs to the database
      const newPhoto = new Photo({
        name : response.metadata.photo_name,
        price : response.metadata.photo_price,
        owner: response.metadata.photo_owner,
        filename : response.metadata.photo_id,
      });
      // console.log(newPhoto);
      await newPhoto.save();
      res.redirect(response.hosted_url);
    } catch (error) {
      console.error("Error creating charge:", error.message);
      fs.unlinkSync(req.file.path);
      res.status(500).send("An error occurred during charge creation.");
    }
  });
});

//Todo : create a dynamic /image route to handle the rendered images in the database with their name and description
// !! just to make you remember for later that here Photo is the model for your 'photos' collection

app.get("/nft", async (req, res) => {
  //** Here we are getting an array of JSon objects back in which each object is a single 'photo' object which has a name and description
  const photo = await Photo.find({});
  //**  we render the photo array to the /image route
  res.render("nft", { photo: photo });
});

//?? will figure out later if we need to implement this route
app.get("/status", async (req, res) => {
  res.render("status.ejs", { photo: req.body.photo });
});

//? listening on port 3000
app.listen(port, () => {
  console.log("Server is running on port : " + port);
});
