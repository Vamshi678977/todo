const express = require('express')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbpath = path.join(__dirname, 'twitterClone.db')
let db = null

const creatingandconnectingdatabase = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('server is running')
    })
  } catch (e) {
    console.log(`DB ERROR ${e.message}`)
    process.exit(1)
  }
}

creatingandconnectingdatabase()

//API 1 POST METHOD /register/

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const userdetails = `
                SELECT * FROM 
                user 
                WHERE username = '${username}'`
  const user = await db.get(userdetails)
  if (user !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      response.status(200)
      const encryptedpassword = await bcrypt.hash(password, 10)
      const creatinguser = `
             INSERT INTO user
             (name, username, password, gender)
             VALUES
             ('${name}', '${username}', '${encryptedpassword}', '${gender}')`
      const addinguser = await db.run(creatinguser)
      response.status(200)
      response.send('User created successfully')
    }
  }
})

//API 2 POST METHOD /login/
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const userdetails = `
  SELECT * FROM user 
      WHERE username = '${username}'`
  const checkinguserdetails = await db.get(userdetails)

  if (checkinguserdetails === undefined) {
    //checking invalid userdetails
    response.status(400)
    response.send('Invalid user')
  } else {
    const ispassword = await bcrypt.compare(
      password,
      checkinguserdetails.password,
    )
    if (!ispassword) {
      //checking invalid password
      response.status(400)
      response.send('Invalid password')
    } else {
      payload = {
        username: username,
      }
      //creating a jwt token
      const jwtToken = jwt.sign(payload, 'my_secret_key_is_vamshi')
      response.send({jwtToken})
    }
  }
})

//middleware function Authentication

const aunthenticationmiddlewarefunction = (request, response, next) => {
  const authorheader = request.headers['authorization']
  let token
  if (authorheader !== undefined) {
    token = authorheader.split(' ')[1]
  }
  if (authorheader === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(token, 'my_secret_key_is_vamshi', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        {
          request.username = payload.username
        }
        next()
      }
    })
  }
}

//API 3 GET METHOD /user/tweets/feed/

app.get(
  '/user/tweets/feed/',
  aunthenticationmiddlewarefunction,
  async (request, response) => {
    const {username} = request
    const tweets = `
       SELECT 
          followinguser.username,
          tweet.tweet,
          tweet.date_time as dateTime
       FROM follower INNER JOIN tweet
                ON follower.following_user_id = tweet.user_id INNER JOIN user AS followinguser ON tweet.user_id = followinguser.user_id INNER JOIN 
                user AS followeruser ON followeruser.user_id = follower.follower_user_id
                WHERE followeruser.username = '${username}'
                ORDER BY tweet.date_time DESC
                LIMIT 4`
    const usertweets = await db.all(tweets)
    response.send(usertweets)
  },
)

//API 4 GET METHOD /user/following/

app.get(
  '/user/following/',
  aunthenticationmiddlewarefunction,
  async (request, response) => {
    const {username} = request
    const usernamesofpeople = `
    SELECT user.name
    FROM user INNER JOIN follower 
    ON user.user_id = follower.following_user_id  INNER JOIN user AS followeruser ON follower.follower_user_id = followeruser.user_id
    WHERE followeruser.username = '${username}'
    `
    const usernamedetails = await db.all(usernamesofpeople)
    response.send(usernamedetails)
  },
)

//API 5 GET METHOD /user/followers/

app.get(
  '/user/followers/',
  aunthenticationmiddlewarefunction,
  async (request, response) => {
    const {username} = request
    const userfollowers = `
    SELECT user_id FROM user WHERE username = '${username}'`
    const usernameoffollower = await db.get(userfollowers)

    const peoplenames = `
   SELECT user.name 
   FROM follower INNER JOIN user 
   ON follower.follower_user_id = user.user_id                                            
   WHERE following_user_id = ${usernameoffollower.user_id}`
    const followingusers = await db.all(peoplenames)
    response.send(followingusers)
  },
)

//middlware invalid request
const failedrequest = async (request, response, next) => {
  const {username} = request
  const {tweetId} = request.params
  const userinvalid = ` SELECT * FROM tweet 
      WHERE tweet_id = '${tweetId}' AND 
                  tweet.user_id IN (SELECT following_user_id FROM follower
                  INNER JOIN user ON follower.follower_user_id = user.user_id
                  WHERE user.username = '${username}')`
  const followingtweet = await db.get(userinvalid)
  if (followingtweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

//API 6 GET METHOD /tweets/:tweetId/

app.get(
  '/tweets/:tweetId/',
  aunthenticationmiddlewarefunction,
  failedrequest,
  async (request, response) => {
    const {tweetId} = request.params
    const tweetdetails = `
   SELECT 
   tweet.tweet,
   COUNT(DISTINCT like.like_id) AS likes,
  COUNT (DISTINCT reply.reply) AS replies,
   tweet.date_time AS dateTime
   FROM tweet LEFT JOIN like ON 
    tweet.tweet_id = like.tweet_id 
    LEFT  JOIN reply ON tweet.tweet_id = reply.tweet_id   
    WHERE 
      tweet.tweet_id = ${tweetId}
      GROUP BY tweet.tweet_id`
    const details = await db.get(tweetdetails)
    response.send(details)
  },
)

//API 7 GET METHOD /tweets/:tweetId/likes/

app.get(
  '/tweets/:tweetId/likes/',
  aunthenticationmiddlewarefunction,
  failedrequest,
  async (request, response) => {
    const {tweetId} = request.params

    const userdetails = `SELECT user.username 
                        FROM user INNER JOIN 
                        like ON user.user_id = like.user_id 
                         WHERE like.tweet_id = '${tweetId}'`

    const likes = await db.all(userdetails)
    let myarray = []
    for (let items of likes) {
      myarray.push(items.username)
    }
    response.send({
      likes: myarray,
    })
  },
)

//API 8 GET METHOD /tweets/:tweetId/replies/

app.get(
  '/tweets/:tweetId/replies/',
  aunthenticationmiddlewarefunction,
  failedrequest,
  async (request, response) => {
    const {tweetId} = request.params
    const replies = `
    SELECT user.name,
    reply.reply 
        FROM user INNER JOIN reply ON user.user_id = reply.user_id 
        WHERE tweet_id = '${tweetId}'`
    const userreplies = await db.all(replies)
    response.send({
      replies: userreplies,
    })
  },
)

//API 9 GET METHOD /user/tweets/

app.get(
  '/user/tweets/',
  aunthenticationmiddlewarefunction,
  async (request, response) => {
    const {username} = request
    const twitterdetails = `
           SELECT 
           tweet.tweet,
           COUNT(DISTINCT like.like_id) AS likes,
           COUNT(DISTINCT reply.reply) As replies,
           tweet.date_time As dateTime 
           FROM tweet INNER JOIN user
           ON tweet.user_id = user.user_id 
           LEFT  JOIN like ON tweet.tweet_id = like.tweet_id LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
           WHERE user.username = '${username}'
           GROUP BY tweet.tweet_id`
    const detailstweet = await db.all(twitterdetails)
    response.send(detailstweet)
  },
)

//API 10 POST METHOD /user/tweets/

app.post(
  '/user/tweets/',
  aunthenticationmiddlewarefunction,
  async (request, response) => {
    const {tweet} = request.body
    const {username} = request
    const userdetails = `
      SELECT user.user_id FROM user 
         WHERE username = '${username}'`
    const usernamefromusertable = await db.get(userdetails)
    const tweetdetails = `
   INSERT INTO tweet 
   (tweet, user_id) 
   VALUES('${tweet}', ${usernamefromusertable.user_id})`
    const addingtweet = await db.run(tweetdetails)
    response.send('Created a Tweet')
  },
)

//API 11 DETLETE METHOD /tweets/:tweetId/

app.delete(
  '/tweets/:tweetId/',
  aunthenticationmiddlewarefunction,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const usernameoftweet = `
    SELECT user.username FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE tweet.tweet_id = ${tweetId}`
    const tweetedusername = await db.get(usernameoftweet)

    if (username === tweetedusername.username) {
      const tweetdelete = ` DELETE FROM tweet 
  WHERE tweet.tweet_id = '${tweetId}'`
      const deletetweet = await db.run(tweetdelete)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app
