var rm = new TF.Backend.RequestManager();
var backend = new TF.Backend.Backend("/components/tf-tensorboard/demo/giant_data", rm, true);

function makeHistogramDashboard(el: any, elScope: any) {
  var chartWidth = 300,
      chartHeight = 250;

  var actionsPanel = elScope.$.actions;

  actionsPanel.addEventListener("change", function(e) {
    var property = e.detail.method,
        value = e.detail.value;

    if (property === "zoom") {
      if (value === "in") {
        chartWidth = chartWidth  * 1.5;
        chartHeight = chartHeight * 1.5;
      } else if (value === "out") {
        chartWidth = chartWidth  / 1.5;
        chartHeight = chartHeight / 1.5;
      }
    }
    var radarResponse = radar.scan();
    radarResponse.visible.concat(radarResponse.almost.concat(radarResponse.hidden)).forEach(function(n:any) {
      var chart = histogramChartsByRunTag[n.run + n.tag];
      chart[property] = value;
      chart.width = chartWidth;
      chart.height = chartHeight;
      chart.dirty = true;
    });
    radarResponse.visible.forEach(function(n:any) {
      var chart = histogramChartsByRunTag[n.run + n.tag];
      chart.draw(1000);
      chart.dirty = false;
    });
  })

  var chartsContainer: d3.Selection<HCategory> = d3.select(el);
  var frame = el.parentElement.parentElement;
  var radar = new TF.NodeRadar(frame);
  var histogramChartsByRunTag = {}; //dictionary to find chart nodes from noderadar values.

  // Scanning
  setInterval(function() {
    console.log("Scanning");
    var response = radar.scan();
    response.almost.concat(response.visible).forEach(function(n:any) {
      var c = histogramChartsByRunTag[n.run + n.tag];
      if (c.dirty) {
        c.draw();
        c.dirty = false;
      }
      if (!c.dataRequested) {
        console.log("requesting")
        backend.histograms(n.run, n.tag).then(function(data) {
          c.data = processData(data);
          c.dirty = true;
          c.dataLoaded;
        });
      }
      c.dataRequested = true;
    })
  }, 500);

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

    var runsByTagByCategory = hcats.map(function(d: any) {
      d.runsByTag = d3.nest()
          .key(function(d: any) { return d.tag; })
          .entries(d.runTags);
      console.log(d.runsByTag)
      return d;
    })

    console.log(hcats);
    var category = chartsContainer.selectAll(".category").data(hcats, (d: any) => d.name),
        categoryExit = category.exit().remove(),
        categoryEnter = category.enter().append("div").attr("class", "category"),
        categoryUpdate = category
            .style("position", "relative");

    categoryEnter.append("h3")
        .text((d) => d.name);

    var tag = categoryUpdate.selectAll(".tag").data((d: any) => d.runsByTag, (d: any) => d.key),
        tagExit = tag.exit().remove(),
        tagEnter = tag.enter().append("div").attr("class", "tag"),
        tagUpdate = tag;

    tagUpdate.append("h4")
        .text((d) => d.key)

    var run = tagUpdate.selectAll(".run").data((d: any) => d.values, (d: any) => d.run),
        runExit = run.exit().remove(),
        runEnter = run.enter().append("div").attr("class", "run"),
        runUpdate = run
            .style("width", chartWidth + "px")
            .style("height", chartHeight + "px");

    run.append("h5")
        .text((d: any) => d.run);

    console.time("histogram enter");
    var histogramEnter = runEnter.append("tf-vz-histogram-series"),
        histogramUpdate = runUpdate.select("tf-vz-histogram-series");

    histogramUpdate.each(function(d:any) {
      histogramChartsByRunTag[d.run + d.tag] = this;
      var c = this;
      c.width = chartWidth;
      c.height = chartHeight;
      radar.add(this, d);
    });
    console.timeEnd("histogram enter");



    //TODO This adds the css scoping necessary for the new elements
    elScope.scopeSubtree(elScope.$.content, false);
  });


  function processData(data: any) {
    data.forEach(function(dd: any, i: Number) {
      var prev = null;
      dd.wallDate = new Date(dd.wall_time);
      dd.wall = dd.wallDate ? dd.wallDate.valueOf() : null;
      dd.i = i;
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
        bin.center = (bin.left + bin.right) / 2;
        bin.count = dd.bucketCounts[i];
        bin.area =  bin.count / (bin.right - bin.left);
        prev = ddd;
        return bin;
      });

      // TODO rebin and remove this...
      dd.histogramData = dd.histogramData.filter(function(d) { return (d.right - d.left) > 0.0035; })

      dd.binExtent = [dd.min, dd.max];
      dd.countExtent = d3.extent(dd.histogramData, function(d:any) { return d.count; });
      dd.areaMax = d3.max(dd.histogramData, function(d:any) { return d.area; })
      dd.leftMin = d3.min(dd.histogramData, function(d:any) { return d.left; });
      dd.rightMax = d3.max(dd.histogramData, function(d:any) { return d.right; });
    });
    return data.filter(function(d) { return d.step; }); //TODO Bad, some step values are undefined
  }
}
