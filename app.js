//? requiring all the dependencies
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv").config();
const session = require('express-session');
const ejs_mate = require("ejs-mate");
const methodOverride = require("method-override");
const cookieParser = require("cookie-parser");
const passport = require("passport");
//! flash module is unnecessary, to be removed later
const flash = require('connect-flash');

const port = process.env.PORT || 3000;

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

app.get('/', (req,res)=>{
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

app.listen(port, () => {
  console.log('Server is running on port : 3000');
});


