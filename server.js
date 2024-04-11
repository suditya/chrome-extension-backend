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
const PORT = 3002;
const SCHEDULE_EMAIL_COLL = "scheduledEmails";
const ADMIN_EMAIL = "leetcodereminderx@gmail.com";


app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Middleware to parse URL-encoded bodies
app.use(cors())

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

// Route to receive data and schedule email sending
app.post('/api/schedule-email', async (req, res) => {
    try {
        // console.log(req.body)
        const problemLink = req.body.problemLink ?? "problem link";
        const email = req.body.email ?? "email";
        const afterDays = req.body.afterDays ?? '7';
        const problemName = req.body.problemName ?? "problem name";

        const scheduledDay = getFutureDate(afterDays)
        // add to the DB Q
        const emailDoc = {
            email, problemLink, problemName, scheduledDay
        }
        console.log(emailDoc, " email Doc ")
        await db.collection(SCHEDULE_EMAIL_COLL).insertOne(emailDoc);
        return res.status(200).send(`Email scheduled successfully`);
    } catch (e) {
        return res.status(500).send(`Error sending email reason : ${e}`);
    }
});


// Scheduling email sending using node-cron
cron.schedule("0 0 * * * *", async () => { // currently running every hour
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
                    from: ADMIN_EMAIL,    // Sender email (must be a Gmail account)
                    to: email,
                    subject: `Reminder: Solve "${problemName}" on LeetCode`,
                    text: `Don't forget to solve the problem "${problemName}" on LeetCode. Here's the link: ${problemLink}`
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
