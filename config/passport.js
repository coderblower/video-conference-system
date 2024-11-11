
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');  // Adjust the path to your User model

const JWT_SECRET = 'secret';  // Make sure to use a secure secret in production

// Local authentication strategy

module.exports = function(passport){
    passport.use(new LocalStrategy(
        function(username, password, done) {
          User.findOne({ where: { username } })
            .then(user => {
              if (!user) {
                return done(null, false, { message: 'Incorrect username.' });
              }
      
              bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) return done(err);
                if (!isMatch) return done(null, false, { message: 'Incorrect password.' });
      
                // Generate token
                const payload = { id: user.id, username: user.username };
                const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
      
                // Return user and token
                return done(null, user, { message: 'Authentication successful', token });
              });
            })
            .catch(err => done(err));
        }
      ));
      
      // Serialize and deserialize user (for session handling, though we're using JWT)
      passport.serializeUser((user, done) => {
        done(null, user.id);  // Serialize by user ID
      });
      
      passport.deserializeUser((id, done) => {
        User.findByPk(id)
          .then(user => done(null, user))
          .catch(err => done(err));
      });
      
}
