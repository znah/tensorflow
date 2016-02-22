var rm = new TF.Backend.RequestManager();
var backend = new TF.Backend.Backend("/components/tf-tensorboard/demo/giant_data", rm, true);

function makeHistogramDashboard(el: any, elScope: any) {

  var chartsContainer: d3.Selection<HCategory> = d3.select(el);

  interface RunTag {
    run: string;
    tag: string;
  }

  interface HCategory {
    name: string;
    runTags: RunTag[];
  }

  function histogramCategories(x: TF.Backend.RunsResponse): HCategory[] {
    var enumerations = <TF.Backend.RunEnumeration[]> _.values(x);
    var tags: string[][] = enumerations.map((e) => e.histograms);
    var all_tags: string[] = _.union.apply(null, tags);
    var categorizer = Categorizer.topLevelNamespaceCategorizer;
    var categories = categorizer(all_tags);

    var runNames = _.keys(x);
    function tag2runtag(t: string): RunTag[] {
      return runNames.filter((r) => {
        return x[r].histograms.indexOf(t) !== -1;
      }).map((r) => {return {tag: t, run: r}});
    }

    return categories.map((c) => {
      return {
        name: c.name,
        runTags: _.flatten(c.tags.map(tag2runtag))
      };
    });
  };

  backend.runs().then((x) => {
    var hcats = histogramCategories(x);
    var d3category = chartsContainer.selectAll(".category")
        .data(hcats)
      .enter().append("div")
        .classed("category", true);

    var d3chart = d3category.selectAll(".chart")
        .data((d) => d.runTags)
      .enter().append("div")
        .classed("chart", true);

    d3chart.append("div")
        .text((d: RunTag) => d.run + " " + d.tag);

    var test = d3chart.append("tf-vz-histogram-series");

    test.each(function(d:any, i) {
      var c = this;
      c.width = 400;
      c.height = 230;
      c.draw();
      if (i < 5) {
        backend.histograms(d.run, d.tag).then(function(data) {
          c.data = processData(data);
          c.draw();
        })
      }
    });

    function processData(data: any) {
      // bucketCounts: Array[143]
      // bucketRightEdges: Array[143]
      // max: 16.746273040771484
      // min: 0
      // nItems: 512000
      // step: undefined
      // sum: 68274.20579528809
      // sumSquares: 119526.37719496872
      // wall: NaN
      // wallDate: Invalid Date
      // wall_time: Fri Jan 29 2016 19:06:24 GMT-0800 (PST)
      data.forEach(function(dd: any) {
        var prev = null;
        // dd.wall = +dd[0] * 1000; //TODO is this correct??
        dd.wallDate = new Date(dd.wall_time);
        dd.wall = dd.wallDate ? dd.wallDate.valueOf() : null;

        dd.histogramData = dd.bucketRightEdges.map(function(ddd: any, i) {
          var bin: any = {};
          var value = (ddd === 0 ? -1e-12 : ddd)
          if (prev === null) {
            if (value > 0) {
              bin.left = (value / 1.1);
            } else {
              bin.left = (value * 1.1);
            }
          } else {
            bin.left = prev;
          }
          if (value > dd.max) {
            if (value > 0) {
              bin.right = bin.left * 1.1;
            } else {
              bin.right = bin.left / 1.1;
            }
          } else {
            bin.right = value;
          }
          bin.count = dd.bucketCounts[i];
          bin.area =  bin.count / (bin.right - bin.left);
          prev = ddd;
          return bin;
        });

        // TODO rebin and remove this...
        dd.histogramData = dd.histogramData.filter(function(d) { return (d.right - d.left) > 0.0035; })


        dd.binExtent = [dd.min, dd.max];
        dd.areaMax = d3.max(dd.histogramData, function(d:any) { return d.area; })
        dd.leftMin = d3.min(dd.histogramData, function(d:any) { return d.left; });
        dd.rightMax = d3.max(dd.histogramData, function(d:any) { return d.right; });
        dd.countExtent = d3.extent(dd.histogramData, function(d:any) { return d.count; });
      });
      return data.filter(function(d) { return d.step; });//TODO Bad
    }

    // This adds the css scoping necessary for the new elements
    elScope.scopeSubtree(elScope.$.container, false);
  });

}
