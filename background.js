$(function() {

	window.my_divvy_data = [];
	var total_trips = 0;
  window.calculating = false;
  window.showing_sidebar = true; 

  // Scrape the trips info table
  function scrapeDivvyData() {
  	$('tbody').children().each(function() {
      row = $(this).children();
      var trip_id = row.eq(0).text();
      var start_station = row.eq(1).text();
  		var start_date = row.eq(2).text();
      var end_station = row.eq(3).text();
  		var end_date = row.eq(4).text();
  		var duration = row.eq(5).text();
  		var trip_data = { "trip_id" : trip_id, "start_station" : start_station, "start_date" : start_date, "end_station" : end_station, "end_date" : end_date, "duration" : duration };
  		window.my_divvy_data.push(trip_data);
  	});
  }
  scrapeDivvyData();

  function roundTenths(number) {
    return parseInt(number * 10) / 10
  }

  // Create Divvybrags sidebar menu
  content_html = "<br/><div id='divvybrags'>";
  content_html += "<div id='toggle-divvybrags'>X</div><br/><br/>";
  content_html += "<div id='divvybrags-body'>";
  content_html += "<h2>DivvyBrags</h2><br/><br/>";
  content_html += "<p id='calculate-my-milage' class='divvybrags-option'>Calculate my Mileage</p>";
  content_html += "<p id='milage-calculating-status'></p>";
  content_html += "<p id='download-csv' class='divvybrags-option'>Download as CSV</p>";
  content_html += "<p id='make-chart' class='divvybrags-option'>Chart My Data</p>";
  content_html += "<p id='chart-making-status'></p>";
  content_html += "</div></div>";
  $('#content').after(content_html);
  $('table').before("<div id='chart-area'></div><div id='chart-area-margin'></div>");
  
  window.total_milage = 0; 
  window.trips_calculated = 0;

  var station_distances_url = chrome.extension.getURL("station_distances_by_bicycle.csv");

  // Pull in the big CSV of Divvy distances. Thanks Nick Bennett for building this! :)
  $.ajax({
      type: "GET",
      url: station_distances_url,
      dataType: "text",
      success: function(data) {
        processData(data);
      }
   });

  // Read the big CSV file of distances and store in window.lines
  function processData(allText) {
    var allTextLines = allText.split(/\r\n|\n/);
    var headers = allTextLines[0].split(',');
    var lines = [];

    for (var i = 1; i < allTextLines.length; i++) {
        var data = allTextLines[i].split(',');
        if (data.length == headers.length) {
            var tarr = {};
            for (var j = 0; j < headers.length; j++) {
                tarr[headers[j]] = data[j];
            }
            lines.push(tarr);
        }
    }
    window.lines = lines;
  }

  // This is what happens when the user wants to find out her/his total Divvy milage
  function calculateMyMilage() {
    if (window.calculating === false) {
      window.calculating = true;
      var loader_img = chrome.extension.getURL("ajax-loader.gif");              // Create loading gif animation
      $('#calculate-my-milage').append("<img id='loading-gif' src='" + loader_img + "'>");
      for (var i = 0; i < window.my_divvy_data.length; i++) {
        csv_response = getMilageFromCSV(window.my_divvy_data[i], i);            // Check to see if the stations are in the CSV
        if (csv_response === false) {
          google_response = getMilageFromGoogle(window.my_divvy_data[i], i);    // If not, ask Google for distances
          if (google_response === false) {
            handleNoMilageRow(i)                                                // If Google's clueless, no miles for you
          }
        }
      }
    }
  };

  function getMilageFromCSV(trip, i) {
    var station1 = trip["start_station"];
    var station2 = trip["end_station"];
    if (station1 !== station2) {
      window.match_found = false;
      for (k = 0; k < window.lines.length; k++) {
        var this_pair = window.lines[k];
        if ((this_pair["station1"] === station1 && this_pair["station2"] === station2) || (this_pair["station1"] === station2 && this_pair["station2"] === station1)) {
          var milage = parseFloat(this_pair["distance"] * 0.000621371);   // Distances in the CSV are stored as meters, so  convert them to miles here
          window.my_divvy_data[i]["milage"] = milage;
          window.total_milage += milage;
          window.trips_calculated += 1;
          window.match_found = true;
          $('#milage-calculating-status').html(String(window.trips_calculated) + " out of " + String(window.my_divvy_data.length) + " trips calculated.");
          // When there are no more trips to calculate, post the results in the notice area of the Divvybrags sidebar
          if (trips_calculated === window.my_divvy_data.length) {
            postResults(window.total_milage);
          }
        }
      }
      if (window.match_found === false) {
        return false          // Pass to Google Distance API since these station names aren't in the CSV file
      }
    } else {
      handleNoMilageRow(i)    // No milage for this trip if the start station is the same as the end station 
    }
  }

  function handleNoMilageRow(i) {
    window.my_divvy_data[i]["milage"] = 0;
    window.trips_calculated += 1;
    $('#milage-calculating-status').html(String(window.trips_calculated) + " out of " + String(window.my_divvy_data.length) + " trips calculated.");
    if (window.trips_calculated === window.my_divvy_data.length) {
      postResults(window.total_milage);
    }
  }

  // This function describes how to ask the Google Distance API for approximate trip distances
  function getMilageFromGoogle(trip, i) {

    // There are a few station locations that Google doesn't parse well -- swap those out for more precise addresses
    if (trip["start_station"] !== "Theater on the Lake" && trip["start_station"] !== "Daley Center Plaza") {
      start = trip["start_station"].replace(/\s/g, "+").replace(/&/,"and") + "+Chicago,+IL,+USA";
    } else if (trip["start_station"] === "Theater on the Lake") {
      start = "2401+N+Lake+Shore+Dr,+Chicago,+IL,+USA";
    } else if (trip["start_station"] === "Daley Center Plaza") {
      start = "50+W+Washington+St,+Chicago,+IL,+USA";
    }
    if (trip["end_station"] !== "Theater on the Lake" && trip["end_station"] !== "Daley Center Plaza") {
      end = trip["end_station"].replace(/\s/g, "+").replace(/&/,"and") + "+Chicago,+IL,+USA";
    } else if (trip["end_station"] === "Theater on the Lake") {
      end = "2401+N+Lake+Shore+Dr,+Chicago,+IL,+USA";
    } else if (trip["end_station"] === "Daley Center Plaza") {
      end = "50+W+Washington+St,+Chicago,+IL,+USA";
    }

    google_url = "https://maps.googleapis.com/maps/api/distancematrix/json?origins=" + start + "&destinations=" + end + "&sensor=false&mode=bicycling&units=imperial"
    $.ajax({
      type: "POST",
      url: google_url,
      success: function(data) {
        if (data.status === "OK") {
          response = data["rows"][0]["elements"][0]["distance"]["text"]
          if (response.indexOf("ft") === -1) {
            milage = parseFloat(response.replace(/\s/g, "").replace(/mi/g, ""));
          } else {
            milage = parseFloat(response.replace(/\s/g, "").replace(/ft/g, "") / 5280);
          }
          if (milage < 20) {                            // Sanity check in case Google wildly mis-reads the location of a Divvy station based on its name.
            window.my_divvy_data[i]["milage"] = milage;
            total_milage += milage;
            trips_calculated += 1;
            $('#milage-calculating-status').html(String(trips_calculated) + " out of " + String(window.my_divvy_data.length) + " trips calculated.");
            // When there are no more trips to calculate, post the results in the notice area of the Divvybrags sidebar
            if (trips_calculated === window.my_divvy_data.length) {
              postResults(total_milage);
            }
          } else {
            return false 
          }
        }
        // If the Google API says we're over the query limit, keep trying until we're not
        if (data.status === "OVER_QUERY_LIMIT") {
          if (data.error_message !== "You have exceeded your daily request quota for this API.") {
            getMilageFromGoogle(trip, i);
          } else {
            $('#milage-calculating-status').html("Google Distance Matrix daily limit reached, try again tomorrow. :(");
            $('#loading-gif').remove()
            return false 
          }
        }
        if (data.status === "REQUEST_DENIED" || data.status === "MAX_ELEMENTS_EXCEEDED") {
          console.log("uh oh...");
          return false 
        }
      }
    });
  };

  // Display milage results in the sidebar
  function postResults(total_milage) {
    total_milage = roundTenths(total_milage);
    number_of_trips = window.my_divvy_data.length
    notice_area_html = ("<p class='notice-area-text'>Number of trips: " + number_of_trips + "</p>");
    notice_area_html += ("<p class='notice-area-text'>Approximate distance traveled: " + total_milage + "mi</p>");
    $('#calculate-my-milage').html("My stats");
    $('#calculate-my-milage').attr("style","text-decoration: underline;");
    $('#calculate-my-milage').after(notice_area_html);
    $('#loading-gif').remove()
  }

  Date.prototype.addDays = function(days) {
    var dat = new Date(this.valueOf())
    dat.setDate(dat.getDate() + days);
    return dat;
  }

  function getDates(startDate, stopDate) {
    var dateArray = new Array();
    var currentDate = startDate;
    while (currentDate <= stopDate) {
        dateArray.push( new Date (currentDate) )
        currentDate = currentDate.addDays(1);
    }
    return dateArray;
  }

  function makeChart() {
    var additive_milage_array = [];
    var daily_milage_array = [];
    var cumulative_milage_array = [0];
    var dates_with_trips = [];
    var milage_calculated = false;

    for (var i = 0; i < window.my_divvy_data.length; i++) {
      if (window.my_divvy_data[i]["milage"] !== undefined) {
        milage_calculated = true;
      }
    }

    if (milage_calculated === false) {
      $('#chart-making-status').html("Please calculate your milage first. We'll use that data to create a chart for you.");
      return
    }

    // Generating an array with all the dates between user's first Divvy ride and user's most recent Divvy ride
    first_date = new Date(window.my_divvy_data[0]["start_date"]);
    last_date = new Date(window.my_divvy_data[window.my_divvy_data.length - 1]["start_date"]);
    date_array = getDates(first_date, last_date);

    // Stuff arrays with data representing daily trip miles and cumulative trip miles...
    for (var j = 0; j < date_array.length; j++) {

      milage_present = false;

      // Check to see if the user took bike rides on any given day. If so, add up miles
      for (var i = 0; i < window.my_divvy_data.length; i++) {
        trip = window.my_divvy_data[i];
        this_trip_date = new Date(trip["start_date"]);
        if (this_trip_date.getTime() === date_array[j].getTime()) {
          milage_present = true;
          if (dates_with_trips.indexOf(this_trip_date.getTime()) === -1) {
            dates_with_trips.push(this_trip_date.getTime()); 
            daily_milage_array.push(roundTenths(trip["milage"]));
            last_cumulative_miles = cumulative_milage_array[cumulative_milage_array.length -1]
            cumulative_milage_array.push(last_cumulative_miles + roundTenths(trip["milage"]));
          } else {
            daily_milage_array[daily_milage_array.length - 1] = roundTenths(trip["milage"] + daily_milage_array[daily_milage_array.length - 1])
            cumulative_milage_array[cumulative_milage_array.length -1] = roundTenths(trip["milage"] + cumulative_milage_array[cumulative_milage_array.length -1])
          }
        }
      }

      if (milage_present === false) {
        daily_milage_array.push(0);
        last_cumulative_miles = cumulative_milage_array[cumulative_milage_array.length -1]
        cumulative_milage_array.push(last_cumulative_miles);
      }
    }
    cumulative_milage_array.shift();

    function formatDate(date) {
      return String(date.getMonth() + 1) + "/" + String(date.getDate()) + "/" + String(date.getFullYear());
    }

    var formatted_dates = date_array.map(formatDate);
    var number_of_steps = parseInt(formatted_dates.length / 10);

    $('#chart-area').highcharts({
        chart: { type: 'column' },
        title: { text: 'Divvygraph' },
        xAxis: { 
          categories: formatted_dates,
          labels: { maxStaggerLines: 1, rotation: 315, step: number_of_steps }
         },
        yAxis:
          [{ 
            title: { text: 'Miles This Day', style: { color: '#3DB7E4' } }, 
            labels: { style: { color: '#3DB7E4' } }
          },
          { 
            title: { text: 'Total Miles Divvied', style: { color: '#FF7518' } }, 
            labels: { style: { color: '#FF7518' } },
            opposite: true,
            min: 0,
          }],
          plotOptions: {
            spline: {
              marker: {
                enabled: false
              }
            }
          },
        series: [
          { type: 'column', name: 'Miles This Day', data: daily_milage_array, color: '#3DB7E4'},
          { type: 'spline', name: 'Total Miles', data: cumulative_milage_array, color: '#FF7518', yAxis: 1 }
          ],
        credits: false
    });
    
    $('#chart-area-margin').html("<br/><br/><br/>");

  }

  function downloadCSV() {
    var csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Trip ID,Start Station,Start Date,End Station,End Date,Duration,Approximate Mileage\n"
    window.my_divvy_data.forEach(function(trip) {
      csvContent += (trip["trip_id"] + "," + trip["start_station"] + "," + trip["start_date"] + "," + trip["end_station"] + "," + trip["end_date"] + "," + trip["duration"] + "," + trip["milage"] +"\n" );
    });
    var encodedUri = encodeURI(csvContent);
    window.open(encodedUri);
  };

  $('#calculate-my-milage').click(function() {
    calculateMyMilage();
  });

  $('#download-csv').click(function() {
    downloadCSV();
  });

  $('#make-chart').click(function() {
    makeChart();
  });

  // Show/hide the sidebar
  $('#toggle-divvybrags').click(function() {
    if (window.showing_sidebar === true) { 
      $('#divvybrags').animate({ height: "35px", width: "35px" });
      $(this).html("&#8601;");
      window.showing_sidebar = false;
    } else {
      $('#divvybrags').animate({ height: "100%", width: "240px" });
      $(this).html("X");
      window.showing_sidebar = true;
    }
  });

});
