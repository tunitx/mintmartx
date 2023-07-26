//? We can now inject the model into the service 

const User = require("./user.model");
const UserService = require("./user.service");

module.exports = UserService(User);
