import json
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.db import IntegrityError
from django.http import JsonResponse
from django.shortcuts import HttpResponse, HttpResponseRedirect, render
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt

from .models import User, Email


def index(request):

    # Authenticated users view their inbox
    if request.user.is_authenticated:
        return render(request, "mail/inbox.html")

    # Everyone else is prompted to sign in
    else:
        return HttpResponseRedirect(reverse("login"))


@csrf_exempt
@login_required
def compose(request):
    # Composing a new email must be via POST
    if request.method != "POST":
        return JsonResponse({"error": "POST request required."}, status=400)

    # Get contents of email
    data = json.loads(request.body)
    recipients_emails = [email.strip() for email in data.get("recipients", "").split(",")]
    subject = data.get("subject", "")
    body = data.get("body", "")

    # Check recipient emails
    if not recipients_emails or recipients_emails == [""]:
        return JsonResponse({
            "error": "At least one recipient required."
        }, status=400)

    # Convert email addresses to users
    recipients = []
    for email in recipients_emails:
        try:
            user = User.objects.get(email=email)
            recipients.append(user)
        except User.DoesNotExist:
            return JsonResponse({
                "error": f"User with email {email} does not exist."
            }, status=400)

    # Create the email - single instance for sender
    email = Email(
        user=request.user,  # This ensures it appears in sender's sent mailbox
        sender=request.user,
        subject=subject,
        body=body,
        read=True  # Sent emails are automatically marked as read for sender
    )
    email.save()
    
    # Add all recipients
    for recipient in recipients:
        email.recipients.add(recipient)
        
        # Create a copy for each recipient in their inbox
        recipient_email = Email(
            user=recipient,
            sender=request.user,
            subject=subject,
            body=body,
            read=False  # New emails are unread for recipients
        )
        recipient_email.save()
        recipient_email.recipients.add(recipient)
    
    return JsonResponse({"message": "Email sent successfully."}, status=201)

@login_required
def mailbox(request, mailbox):
    if mailbox == "inbox":
        emails = Email.objects.filter(
            user=request.user,
            archived=False,
            # Either received or sent (if you want to show sent in inbox too)
            recipients=request.user
        )
    elif mailbox == "sent":
        emails = Email.objects.filter(
            user=request.user,
            sender=request.user
        )
    elif mailbox == "archive":
        emails = Email.objects.filter(
            user=request.user,
            archived=True,
            recipients=request.user
        )
    else:
        return JsonResponse({"error": "Invalid mailbox."}, status=400)
    
    emails = emails.order_by("-timestamp").all()
    return JsonResponse([email.serialize() for email in emails], safe=False)


@csrf_exempt
@login_required
def email(request, email_id):

    # Query for requested email
    try:
        email = Email.objects.get(user=request.user, pk=email_id)
    except Email.DoesNotExist:
        return JsonResponse({"error": "Email not found."}, status=404)

    # Return email contents
    if request.method == "GET":
        return JsonResponse(email.serialize())

    # Update whether email is read or should be archived
    elif request.method == "PUT":
        data = json.loads(request.body)
        if data.get("read") is not None:
            email.read = data["read"]
        if data.get("archived") is not None:
            email.archived = data["archived"]
        email.save()
        return HttpResponse(status=204)

    # Email must be via GET or PUT
    else:
        return JsonResponse({
            "error": "GET or PUT request required."
        }, status=400)


def login_view(request):
    if request.method == "POST":

        # Attempt to sign user in
        email = request.POST["email"]
        password = request.POST["password"]
        user = authenticate(request, username=email, password=password)

        # Check if authentication successful
        if user is not None:
            login(request, user)
            return HttpResponseRedirect(reverse("index"))
        else:
            return render(request, "mail/login.html", {
                "message": "Invalid email and/or password."
            })
    else:
        return render(request, "mail/login.html")


def logout_view(request):
    logout(request)
    return HttpResponseRedirect(reverse("index"))


def register(request):
    if request.method == "POST":
        email = request.POST["email"]

        # Ensure password matches confirmation
        password = request.POST["password"]
        confirmation = request.POST["confirmation"]
        if password != confirmation:
            return render(request, "mail/register.html", {
                "message": "Passwords must match."
            })

        # Attempt to create new user
        try:
            user = User.objects.create_user(email, email, password)
            user.save()
        except IntegrityError as e:
            print(e)
            return render(request, "mail/register.html", {
                "message": "Email address already taken."
            })
        login(request, user)
        return HttpResponseRedirect(reverse("index"))
    else:
        return render(request, "mail/register.html")

