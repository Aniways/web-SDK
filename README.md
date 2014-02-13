#Aniways' Web SDK

The Aniways SDK for the web  
    
##Getting Started Guide


This guide will walk you through adding Aniways to your website.  
  
Getting started with Aniways is very easy and takes less than 10 minutes, just follow these short steps to add Aniways to your site:

##Create your Aniways App  

First, please go to [www.aniways.com](http://www.aniways.com) , add a new App, and get your App Id.


##Installing the Aniways SDK  


Install with [Bower](http://www.bower.io):  

	bower install aniways

Or download the latest dist file:  
  
* src/aniways.js  

* aniways_min.js

##Integration

* Add the `aniways-wall` class to your chat message wall.
* Add the `aniways-message` class to any element containing messaging text
* Call the `Aniways.init()` function as soon as the chat section is added to the DOM.

##Customization

Aniways Images are added the the chat wall and will contain the aniways-image class, go ahead and style it to fit your needs.
