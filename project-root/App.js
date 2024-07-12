const sql = require('mssql');
const redis = require('redis');

// Set up tooltip
var tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0);

// Connect to Azure SQL Database
const sqlConfig = {
    user: 'your-database-username',
    password: 'your-database-password',
    database: 'covidDashboardDB',
    server: 'your-database-server.database.windows.net',
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
        let pool = await sql.connect(sqlConfig);
        let result = await pool.request().query('SELECT * FROM covid_data');
        return result.recordset;
    } catch (err) {
        console.error(err);
    }
}

// Connect to Redis Cache
const redisClient = redis.createClient({
    url: 'redis://your-redis-cache-name.redis.cache.windows.net:6379',
    password: 'your-redis-cache-password'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

async function getDataFromRedis() {
    return new Promise((resolve, reject) => {
        redisClient.get('covid_data', async (err, data) => {
            if (err) reject(err);
            if (data) {
                resolve(JSON.parse(data));
            } else {
                let dbData = await getDataFromDatabase();
                redisClient.set('covid_data', JSON.stringify(dbData), 'EX', 3600);
                resolve(dbData);
            }
        });
    });
}

d3.csv('usa_county_wise.csv').then(function(data) {
    // Load and process GeoJSON
    d3.json('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json').then(async function(geojson) {
        let covidData = await getDataFromRedis();

        // Set up SVG
        var svg = d3.select('#map').append('svg')
            .attr('width', 960)
            .attr('height', 600);

        var projection = d3.geoAlbersUsa()
            .translate([480, 300])
            .scale(1000);

        var path = d3.geoPath().projection(projection);

        var colorScale = d3.scaleSequential(d3.interpolateReds)
            .domain([0, d3.max(covidData, d => +d.cases)]);

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
    });
});
