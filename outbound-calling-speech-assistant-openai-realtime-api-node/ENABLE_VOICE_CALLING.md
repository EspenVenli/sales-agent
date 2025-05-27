# How to Enable Voice Calling on Your Twilio Account

Your AI phone agent is encountering the following error:

```
Error making call: RestException [Error]: Voice calling has been disabled for this account
```

This means that voice capabilities are disabled on your Twilio account. Here's how to fix it:

## Step 1: Log into Twilio Console

Go to [console.twilio.com](https://console.twilio.com) and log in with your credentials.

## Step 2: Navigate to Voice Settings

1. In the left sidebar, click on **Voice**
2. Then select **Settings**
3. Click on the **General** tab if not already selected

## Step 3: Enable Voice Calling

Look for a setting similar to "Voice Calling Enabled" or "Enable Voice Calling" and toggle it ON.

## Step 4: Check Geographic Permissions

Since you're trying to call Denmark:

1. Go to **Voice** > **Settings** > **Geo Permissions**
2. Find "Denmark" in the list
3. Make sure it's enabled for outbound calls

## Step 5: Check Account Balance (Paid Accounts Only)

If you've upgraded to a paid account:
1. Check your account balance to ensure you have sufficient funds
2. Go to **Billing** > **Account Balance** to view your current balance

## Step 6: Verify Your Account Status

If you've recently upgraded from a trial:
1. Make sure the upgrade process is complete
2. Go to **Account** > **General Settings** to verify your account status

## Step 7: Contact Twilio Support

If you've completed all the steps above and still face issues:
1. Go to [Twilio Support](https://support.twilio.com/)
2. Create a ticket describing the error
3. Mention that you've already checked and enabled voice calling settings

## Additional Notes for 10DLC Registration

For SMS capabilities on US numbers, you'll need to register your 10DLC (10-Digit Long Code) number:
1. Go to **Messaging** > **Senders** > **10DLC** 
2. Follow the registration process for your brand and campaigns

Voice calling and SMS are separate features with different requirements.

## After Enabling Voice

Once you've enabled voice calling, run your application again with:

```
node index.js --call=+4531219653
```

Your AI phone agent should now be able to make outbound calls successfully! 