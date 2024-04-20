const express = require('express');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const DB_NAME = "Leetcode-Extension";
const MongoClient = require('mongodb').MongoClient;
const moment = require('moment');
const cors = require('cors');

const uri =
    "mongodb+srv://suditya:Suditya%40123@poodisabjidotcom.jjmenhc.mongodb.net/?retryWrites=true&w=majority&appName=PoodiSabjiDotCom";

const client = new MongoClient(uri, {});
const db = client.db(DB_NAME);
const app = express();
const PORT = process.env.PORT || 3002;
const SCHEDULE_EMAIL_COLL = "scheduledEmails";
const ADMIN_EMAIL = "leetcodereminderx@gmail.com";

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Middleware to parse URL-encoded bodies


// Initialize Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: ADMIN_EMAIL,  // Replace with your Gmail email
        pass: 'xkyb tcay hqil qgrb'           // Replace with your Gmail password
    }
});

const getFutureDate = (afterDays) => {
    // Add a specific number of days
    const futureDate = moment().add(afterDays, 'days');

    // Convert the future date to milliseconds
    const milliseconds = futureDate.valueOf(); // Returns the Unix timestamp in milliseconds

    // console.log(futureDate, "  ", milliseconds); // Output the result
    return futureDate;
}

const isAlreadyScheduled = async (emailDoc) => {
    return await db.collection(SCHEDULE_EMAIL_COLL).findOne({ email: emailDoc.email, problemLink: emailDoc.problemLink, problemName: emailDoc.problemName });
}

app.get('/', (_req, res) => {
    return res.status(200);
})

// Route to receive data and schedule email sending
app.post('/api/schedule-email', async (req, res) => {
    try {
        const { problemLink, email, afterDays, problemName } = req.body;

        // Validate input
        if (!problemLink || !email || !afterDays || !problemName) {
            return res.status(400).json({ message: '❌ Missing required parameters' });
        }

        const scheduledDay = getFutureDate(afterDays);
        const emailDoc = {
            email, problemLink, problemName, scheduledDay
        };

        console.log(emailDoc, " email Doc ");

        const alreadyScheduled = await isAlreadyScheduled(emailDoc);
        if (alreadyScheduled) {
            console.log("email already scheduled");
            const day = alreadyScheduled.scheduledDay;
            const formattedDate = new Date(day._d);
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short' };
            const formattedDateString = formattedDate.toLocaleString('en-US', options);
            const message = `✉️ Email Already Scheduled for ${formattedDateString}`;
            return res.status(200).json({ message });
        }

        await db.collection(SCHEDULE_EMAIL_COLL).insertOne(emailDoc);
        return res.status(200).json({ message: `✅ Email scheduled successfully` });
    } catch (e) {
        console.error('Error scheduling email:', error);
        return res.status(500).json({ message: '❌ Internal server error' });
    }
});



// Scheduling email sending using node-cron
cron.schedule("0 0 9-21 * * *", async () => { // currently running every hour
    console.log(`cron job ran at : ${new Date()}`)
    await sendEmail();
});

const sendEmail = async () => {
    try {
        // get the currrent date 
        // check from DB whichever is less and send the mail 

        const validEmailsToSend = await getValidEmail()
        const successfullySentEmailIds = [];
        try {


            for (const emailDoc of validEmailsToSend) {
                const { _id, email, problemLink, problemName } = emailDoc
                // console.log(emailDoc, " email Doc ");
                const mailOptions = {
                    from: ADMIN_EMAIL,
                    to: email,
                    subject: `Reminder: Solve "${problemName}" on LeetCode`,
                    html: `
                <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>LeetCode Reminder</title>
                        <style>
                            body {
                                background-color: #f4f4f4;
                                font-family: Arial, sans-serif;
                                margin: 0;
                                padding: 20px;
                            }

                            .container {
                                max-width: 600px;
                                margin: 0 auto;
                                background-color: #fff;
                                border-radius: 8px;
                                padding: 30px;
                                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                            }

                            h2 {
                                text-align: center;
                                text-decoration: underline;
                                color: #4caf50;
                                font-size: 28px;
                                font-weight: bold;
                                margin-bottom: 20px;
                            }

                            p {
                                font-size: 16px;
                                line-height: 1.6;
                                color: #333;
                            }

                            a {
                                color: #007bff;
                                text-decoration: none;
                                font-weight: bold;
                            }

                            a:hover {
                                text-decoration: underline;
                            }

                            .emoji {
                                font-size: 24px;
                                margin-right: 5px;
                            }

                            .reminder {
                                text-align: center;
                                margin-bottom: 20px;
                            }
                        </style>
                    </head>
                <body>
                    <div class="container">
                        <h2>LeetCode Reminder<span class="emoji">🔔</span></h2>
                        <div class="reminder">Hello there! <span class="emoji">😊👋</span> Just a friendly reminder to tackle the problem "<strong>${problemName}</strong>" on LeetCode. You've got this! <span class="emoji">💪</span> Remember, every problem is just a puzzle waiting to be solved! <span class="emoji">🧩</span></div>
                        <p>Here's the link to the problem: <a href="${problemLink}" target="_blank">${problemLink}</a>. Take a deep breath, dive in, and give it your best shot! <span class="emoji">🎯</span></p>
                    </div>
                </body>
                </html>

                    `
                };

                // Send email
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error('Error sending email:', error);
                        // res.status(500).send('Error sending email');
                    } else {
                        console.log('Email sent:', info.response);
                        // res.status(200).send('Email scheduled and sent successfully');
                    }
                });
                successfullySentEmailIds.push(_id)
            }
        } catch (error) {
            console.log("was not able to send email due to error: " + error)
        }
        // Delete sent emails from the database
        await db.collection("scheduledEmails").deleteMany({ _id: { $in: successfullySentEmailIds } }); // deleting the succesfully sent emails
        console.log(`Successfully scheduled and deleted ${successfullySentEmailIds.length} scheduled emails`);
    } catch (error) {
        console.log("Not able to schedule emails due to: " + error);
    }
}

const getValidEmail = async () => {
    // assuming all the emails are valid in DB

    // get all the emails from the database
    // create a valid email docs and return it 

    const allEmails = await db.collection(SCHEDULE_EMAIL_COLL).find({}).toArray();
    const validEmails = allEmails.filter(e => {
        const scheduledDateInEmail = moment(e.scheduledDay); // Convert scheduled date to a Moment.js object
        const currentDate = moment();
        // console.log(currentDate.isSameOrAfter(scheduledDateInEmail, 'day'));
        return (currentDate.isSameOrAfter(scheduledDateInEmail, 'day'));
    });
    return validEmails;
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
