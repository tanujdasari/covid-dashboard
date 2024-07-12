// Set up tooltip
var tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0);

// Load COVID-19 data
d3.csv('usa_county_wise.csv').then(function(data) {
    // Load and process GeoJSON
    d3.json('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json').then(function(geojson) {
        // Set up SVG
        var svg = d3.select('#map').append('svg')
            .attr('width', 960)
            .attr('height', 600);

        var projection = d3.geoAlbersUsa()
            .translate([480, 300])
            .scale(1000);

        var path = d3.geoPath().projection(projection);

        var colorScale = d3.scaleSequential(d3.interpolateReds)
            .domain([0, d3.max(data, d => +d.cases)]);

        svg.selectAll('path')
            .data(topojson.feature(geojson, geojson.objects.counties).features)
            .enter().append('path')
            .attr('d', path)
            .attr('class', 'county')
            .style('fill', function(d) {
                var countyData = data.find(c => c.county === d.id); // Match by county ID or name
                return countyData ? colorScale(countyData.cases) : '#ccc';
            })
            .on('mouseover', function(event, d) {
                var countyData = data.find(c => c.county === d.id); // Match by county ID or name
                tooltip.transition().duration(200).style('opacity', .9);
                tooltip.html(`County: ${d.properties.name}<br>Cases: ${countyData ? countyData.cases : 'N/A'}<br>Deaths: ${countyData ? countyData.deaths : 'N/A'}`)
                    .style('left', (event.pageX) + 'px')
                    .style('top', (event.pageY - 28) + 'px');
            })
            .on('mouseout', function() {
                tooltip.transition().duration(500).style('opacity', 0);
            });
    });
});
