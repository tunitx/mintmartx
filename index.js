const express = require("express");
const app = express();
// const mongoose = require("mongoose");
// const path = require("path");
// const axios = require("axios");
// const dotenv = require("dotenv").config();
// const ejs_mate = require("ejs-mate");
// const methodOverride = require("method-override");
// const cookieParser = require("cookie-parser");

const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.engine("ejs", ejs_mate);

app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
// app.use(express.static("express.static("./path-to-views/public")));
app.use(methodOverride("_method"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const passport = require("passport");
app.get('/', (req,res)=>{
res.render('index.ejs');
})

app.listen(3000, () => {
  console.log('Server is running on port : 3000');
});
//test comment for commit 