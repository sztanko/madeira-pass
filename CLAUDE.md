## Intro
Madeira Pass is a micro web app that tracks your location and warns you if you need to buy a pass to walk on the root you are on. It is designed for mobile and is client-side only - there is no backend.


## Elements on the screen:
- Map normally covering 100% of the screen. It is a map of madeira island, with all the hiking routes that need payment for it. Normally, it should show the whole archipelago fitting the map. Map also has typical icons: +/- (for zooming in), 'Find my location' icon + An accordion menu icon - when clicked, it should show links to 'Main', 'List of routes', 'Madeira pass info' and 'About' pages. These pages should be shown on the info panel (see below)
- based on the user's location or user's action, screen can be split into two parts (upper abd lower) - upper wouls show the same map, lower would be an info/interactions panel. It is possible to close the panel, if it is open, but if necessary, it might re-appear if user location changes or user makes an interaction (presses a button, etc). Whenever info panel appears or hides, this should be done using a sleack css animation. 


## User Flow 
1. It requests your location and if within Madeira, will show it (on zoom level that allows seeing 200 meters on the mobile)
    a. If not within madeira, it will just show you a sign saying you are outside of madeira.
2. We maintain information about what routes we already have a pass for. It is stored in a cookie and expires at midnight every day.
4. Routes that we paid for are marked in green or similar color. Other routes have other colour marking.
5. If you are within 50m of any of the route, it should show a message 'you are at <route name>' in the info panel, showing the closest route you are to.
6. If you are within 50m of a dedicated hiking route that requires a pass, and we don't have a confirmation we have bought it, the lower panel should display the name of the route and should warn us that we are at the route that we haven't paid for it yet, and have two buttons: 'Already paid for today' button and 'Buy pass for today' button'.
7. If user presses 'Mark as already paid for today' - it asks to comfirm, then updates the information and marks this route as paid.
8. If user presses 'Buy pass for today' - it will display a message that it will redirect the user the madeiran payment portal and that they should manually mark the route as 'paid' after all is done, after user confirms, user should be redirected to the official madeiran Simplifica portal (https://simplifica.madeira.gov.pt/services/78-82-259) where the user can make the payment for the specific route.
9. If a user taps on any route on the map, it should show the name and whether we have paid for the route in some human readable way one of 'You haven't paid for the route, but you are not on it. You don't have top pay unless you plan to walk on it today'. It also should display both those buttons 'Mark as already paid for today' and 'Buy pass for today' with actions from 7 and 7.


## Technical considerations:
- We don't care about SEO - this is a personal project
- Website should be done in vanilla Typescript React.
- We should use MapLibre as mapping library. We use https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png as vector basemap
- Website should be easy to use and have a sleak minimalistic design.
- project will be open source and hosted on github pages.
- reminder that all cookies set should expire at midnight.
- all text is in english, and there is no i18n required

## Routes pre-processing. 
- Source data can be found here data/routes.geojson (all possible routes in madeira) - from these, we only care about routes that need to be paid. This list can be found here: https://simplifica.madeira.gov.pt/api/infoProcess/259/resources?processId=78
- we need to write a python process that extracts the routes we care about and puts them into a separate geojson. That geojson will be loaded on top of the map.
