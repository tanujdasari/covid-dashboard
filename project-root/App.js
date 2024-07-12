const express = require('express');
const sql = require('mssql');
const redis = require('redis');
const d3 = require('d3');
const topojson = require('topojson-client'); // Ensure this package is installed

const app = express();
const port = process.env.PORT || 3000;

// Set up tooltip
var tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0);

// Connect to Azure SQL Database
const sqlConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    server: process.env.DB_SERVER,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

async function getDataFromDatabase() {
    try {
        console.log('Connecting to SQL Database...');
        let pool = await sql.connect(sqlConfig);
        let result = await pool.request().query('SELECT * FROM covid_data');
        console.log('Data retrieved from SQL Database.');
        return result.recordset;
    } catch (err) {
        console.error('Database error:', err);
        throw err;
    }
}

// Connect to Redis Cache
const redisClient = redis.createClient({
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASS
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

async function getDataFromRedis() {
    try {
        console.log('Fetching data from Redis...');
        return new Promise((resolve, reject) => {
            redisClient.get('covid_data', async (err, data) => {
                if (err) {
                    console.error('Redis get error:', err);
                    reject(err);
                }
                if (data) {
                    console.log('Data retrieved from Redis.');
                    resolve(JSON.parse(data));
                } else {
                    console.log('Data not found in Redis, querying SQL Database...');
                    let dbData = await getDataFromDatabase();
                    redisClient.set('covid_data', JSON.stringify(dbData), 'EX', 3600);
                    console.log('Data saved to Redis.');
                    resolve(dbData);
                }
            });
        });
    } catch (err) {
        console.error('Redis error:', err);
        throw err;
    }
}

// Serve the D3 visualization
app.get('/visualization', async (req, res) => {
    try {
        let covidData = await getDataFromRedis();

        // Set up SVG
        var svg = d3.select('body').append('svg')
            .attr('width', 960)
            .attr('height', 600);

        var projection = d3.geoAlbersUsa()
            .translate([480, 300])
            .scale(1000);

        var path = d3.geoPath().projection(projection);

        var colorScale = d3.scaleSequential(d3.interpolateReds)
            .domain([0, d3.max(covidData, d => +d.cases)]);

        // Load and process GeoJSON
        d3.json('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json').then(geojson => {
            svg.selectAll('path')
                .data(topojson.feature(geojson, geojson.objects.counties).features)
                .enter().append('path')
                .attr('d', path)
                .attr('class', 'county')
                .style('fill', function(d) {
                    var countyData = covidData.find(c => c.county === d.id);
                    return countyData ? colorScale(countyData.cases) : '#ccc';
                })
                .on('mouseover', function(event, d) {
                    var countyData = covidData.find(c => c.county === d.id);
                    tooltip.transition().duration(200).style('opacity', .9);
                    tooltip.html(`County: ${d.properties.name}<br>Cases: ${countyData ? countyData.cases : 'N/A'}<br>Deaths: ${countyData ? countyData.deaths : 'N/A'}`)
                        .style('left', (event.pageX) + 'px')
                        .style('top', (event.pageY - 28) + 'px');
                })
                .on('mouseout', function() {
                    tooltip.transition().duration(500).style('opacity', 0);
                });

            res.send(svg.node().outerHTML);
        }).catch(err => {
            console.error('GeoJSON load error:', err);
            res.status(500).send('Error loading GeoJSON.');
        });
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
