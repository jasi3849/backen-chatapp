const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");
const crypto = require("crypto");
const app = express();
const port = 4000;
const http = require("http");
const fetch = require("node-fetch"); // Required for sending push notifications
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const jwt = require("jsonwebtoken");

mongoose
  .connect(
    // "mongodb+srv://jayrajsinghjs54:12345@cluster0.3qdap.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
    "mongodb+srv://jayrajsinghjs54:12345@cluster0.qr1vp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
  )
  .then(() => {
    console.log("MongoDb connected");
  })
  .catch((err) => {
    console.log(err);
  });
// Create HTTP server
const server = http.createServer(app);


// const User = require("./models/user.js")
const Conversation = require("./models/conversations.js")

const User = require("./models/user.js");

// OneSignal Configuration
const ONE_SIGNAL_APP_ID = "8825d2e5-bdbc-4d71-954d-d24ed8850cc4";
const ONE_SIGNAL_REST_API_KEY = "MzkwODI0MWUtY2ZjOC00ODZjLTg4NDItMjczNGYxMTAwMWM4";

// Function to send push notification
const sendPushNotification = async (userId, messageContent) => {
  try {
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${ONE_SIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify({
        app_id: ONE_SIGNAL_APP_ID,
        include_external_user_ids: [userId],
        contents: { "en": messageContent },
        headings: { "en": "New Message" },
        data: { type: "new_message" }
      })
    });
    const data = await response.json();
    console.log("Notification sent:", data);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};


app.post("/register", async (req, res) => {
  const { name, email, password, image } = req.body;

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Create new user if no duplicates are found
    const newUser = new User({ name, email, password, image });
    await newUser.save();
    res.status(200).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Error creating a user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/// endpoint for login

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.password !== password) {
      return res.status(400).json({ error: "Invalid password" });
    }

    const secretKey = "Q$r2K6W8n!jCW%Zk";

    const token = jwt.sign({ userId: user._id }, secretKey);

    res.status(200).json({ token });
  } catch (error) {
    console.log("error logging in:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/users/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const users = await User.find({ _id: { $ne: userId } });

    res.json(users);
  } catch (error) {
    console.log("error fetching user:", error);
  }
});

app.post("/sendrequest", async (req, res) => {
  const { senderId, receiverId, message } = req.body;

  const receiver = await User.findById(receiverId);

  if (!receiver) {
    return res.status(404).json({ error: "Receiver not found" });
  }
  receiver.requests.push({ from: senderId, message });
  await receiver.save();

  res.status(200).json({ message: "Request sent successfully" });
});

//get all the requests

app.get("/getrequests/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId).populate(
      "requests.from",
      "name email image"
    );

    if (user) {
      res.json(user.requests);
    } else {
      res.status(404).json({ error: "User not found" });
      throw new Error("User not found");
    }
  } catch (error) {
    console.log("error fetching requests:", error);
  }
});


app.post("/acceptrequest", async (req, res) => {
  try {
    const { userId, requestId } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $pull: { requests: { from: requestId } },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    await User.findByIdAndUpdate(userId, {
      $push: { friends: requestId },
    });

    const friendUser = await User.findByIdAndUpdate(requestId, {
      $push: { friends: userId },
    });

    res
      .status(200)
      .json({ message: "Request accepted successfully", requestId });
  } catch (error) {
    console.log("Error accepting request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//get all of our friends chat
app.get("/user/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    const users = await User.findById(userId).populate(
      "friends",
      "name email image",
    );

    res.json(users.friends);
  } catch (error) {
    console.log("error fetching user:", error);
  }
});


// const http = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*", // Ensure CORS allows all origins; adjust if needed
  },
});

const userSocketMap = {};

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  console.log("User connected:", userId, "Socket ID:", socket.id);

  // Map userId to their socket ID
  if (userId !== "undefined") {
    userSocketMap[userId] = socket.id;
    console.log("User socket map updated:", userSocketMap);
  }

socket.on("sendMessage", ({ senderId, receiverId, message }) => {
  const receiverSocketId = userSocketMap[receiverId];
  console.log("Received message:", message, "from", senderId, "to", receiverId);

  // Emit message to receiver directly without saving it to the database
  if (receiverSocketId) {
    io.to(receiverSocketId).emit("receiveMessage", { senderId, receiverId, message });
    console.log("Message sent to receiver:", receiverSocketId);
  } else {
    console.log("Receiver not connected");
  }
});



///////////////////////////////////////////////
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    delete userSocketMap[userId];
  });
});


//////////////////////// o ///////////////////
// app.post("/sendMessage", async (req, res) => {
//   try {
//     const { senderId, receiverId, message } = req.body;
//     const newMessage = new Message({ senderId, receiverId, message });
//     await newMessage.save();

//     // Emit the new message to the receiver
//     const receiverSocketId = userSocketMap[receiverId];
//     if (receiverSocketId) {
//       io.to(receiverSocketId).emit("receiveMessage", newMessage);
//     }

//     // Emit an event for both the sender and receiver to update the chat list preview
//     io.to([receiverSocketId, userSocketMap[senderId]]).emit("latestMessage", {
//       userId: senderId,
//       latestMessage: newMessage,
//     });

//     res.status(201).json(newMessage);
//   } catch (error) {
//     console.log("Error sending message:", error);
//     res.status(500).json({ error: "Message not sent" });
//   }
// });

// app.post("/sendMessage", async (req, res) => {
//   try {
//     const { senderId, receiverId, message } = req.body;

//     // Find an existing conversation between the users
//     let conversation = await Conversation.findOne({
//       users: { $all: [senderId, receiverId] }, // Check for both users
//     });

//     if (!conversation) {
//       // Create a new conversation if one doesn't exist
//       conversation = new Conversation({
//         users: [senderId, receiverId],
//         messages: [],
//       });
//     }

//     // Create the new message
//     const newMessage = {
//       senderId,
//       receiverId,
//       message,
//     };

//     // Add the message to the conversation
//     conversation.messages.push(newMessage);
//     conversation.lastUpdated = Date.now(); // Update the timestamp
//     await conversation.save();

//     // Emit the new message to the receiver
//     const receiverSocketId = userSocketMap[receiverId];
//     if (receiverSocketId) {
//       io.to(receiverSocketId).emit("receiveMessage", newMessage);
//     }

//     // Emit an event to update the chat list preview for both users
//     io.to([receiverSocketId, userSocketMap[senderId]]).emit("latestMessage", {
//       userId: senderId,
//       latestMessage: newMessage,
//     });

//     res.status(201).json(newMessage);
//   } catch (error) {
//     console.log("Error sending message:", error);
//     res.status(500).json({ error: "Message not sent" });
//   }
// });
app.post("/sendMessage", async (req, res) => {
  try {
    const { senderId, receiverId, message } = req.body;

    // Find an existing conversation between the users
    let conversation = await Conversation.findOne({
      users: { $all: [senderId, receiverId] }, // Check for both users
    });

    if (!conversation) {
      // Create a new conversation if one doesn't exist
      conversation = new Conversation({
        users: [senderId, receiverId],
        messages: [],
      });
    }

    // Create the new message
    const newMessage = {
      senderId,
      receiverId,
      message,
      timeStamp: new Date(), // Add timestamp for consistency
    };

    // Add the message to the conversation
    conversation.messages.push(newMessage);
    conversation.lastUpdated = Date.now(); // Update the timestamp
    await conversation.save();

    // Emit the new message to the receiver if they are online
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("receiveMessage", newMessage);
    } else {
      // Send push notification to the receiver if they're offline
      await sendPushNotification(receiverId, message);
    }

    // Emit an event to update the chat list preview for both users
    io.to([receiverSocketId, userSocketMap[senderId]]).emit("latestMessage", {
      userId: senderId,
      latestMessage: newMessage,
    });

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Message not sent" });
  }
});


// app.get("/messages", async (req, res) => {
//   try {
//     const { senderId, receiverId } = req.query;
//     const messages = await Message.find({
//       $or: [
//         { senderId: senderId, receiverId: receiverId },
//         { senderId: receiverId, receiverId: senderId },
//       ],
//     }).populate("senderId", "_id name");
//     res.status(200).json(messages);
//   } catch (error) {
//     console.log("error fetching messages:", error);
//   }
// });

app.get("/messages", async (req, res) => {
  try {
    const { senderId, receiverId } = req.query;

    // Find the conversation
    const conversation = await Conversation.findOne({
      users: { $all: [senderId, receiverId] },
    }).populate("messages.senderId messages.receiverId");

    if (!conversation) {
      // No conversation exists, return an empty array
      return res.status(200).json({ messages: [] });
    }

    res.status(200).json({ messages: conversation.messages });
  } catch (error) {
    console.log("Error fetching messages:", error);
    res.status(500).json({ error: "Error fetching messages" });
  }
});



// app.get("/latestMessage", async (req, res) => {
//   try {
//     const { senderId, receiverId } = req.query;
//     const latestMessage = await Message.findOne({
//       $or: [
//         { senderId: senderId, receiverId: receiverId },
//         { senderId: receiverId, receiverId: senderId },
//       ],
//     })
//       .sort({ timeStamp: -1 }) // Sort by timestamp in descending order
//       .limit(1);
//     res.status(200).json(latestMessage || { message: "No messages yet" });
//   } catch (error) {
//     console.log("Error fetching latest message:", error);
//     res.status(500).json({ error: "Error fetching latest message" });
//   }
// });

app.get("/latestMessage", async (req, res) => {
  try {
    const { senderId, receiverId } = req.query;

    const conversation = await Conversation.findOne({
      users: { $all: [senderId, receiverId] },
    }).sort({ "messages.timeStamp": -1 });

    if (!conversation || conversation.messages.length === 0) {
      return res.status(200).json({ message: "No messages yet" });
    }

    // Get the latest message
    const latestMessage = conversation.messages[conversation.messages.length - 1];

    res.status(200).json(latestMessage);
  } catch (error) {
    console.log("Error fetching latest message:", error);
    res.status(500).json({ error: "Error fetching latest message" });
  }
});



server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});