var rm = new TF.Backend.RequestManager();
var backend = new TF.Backend.Backend("/components/tf-tensorboard/demo/giant_data", rm, true);

function makeHistogramDashboard(el: HTMLElement, elScope: any) {

  var chartsContainer: d3.Selection<HCategory> = d3.select(el);

  var data = [];

  //
  // Chart sizing
  //
  var numColumns = 2 * 2 * 2; //must be power of two
  var chartAspectRatio = 0.75;
  var stageWidth;
  var chartWidth;
  var chartHeight;
  function updateChartSize() {
    stageWidth = el.getBoundingClientRect().width - 48;
    chartWidth = Math.floor(stageWidth / numColumns);
    chartHeight = Math.floor(chartWidth * chartAspectRatio);
  }

  //
  // Radar
  //
  var frame = elScope.$.frame;
  var radar = new TF.NodeRadar(frame);
  var radarResponse;
  var visibleCharts;
  var almostVisibleCharts;
  var allCharts;
  var chartsByRunTag = {}; //dictionary to find chart nodes from noderadar values.

  // Scan every so many milliseconds to keep us honest. Could be better.
  setInterval(scan, 1000);
  function scan() {
    console.log("Scanning");
    radarResponse = radar.scan();
    var getChart = function(n:any) { return { chart: chartsByRunTag[n.run + n.tag], run: n.run, tag: n.tag }; };
    var hiddenCharts = radarResponse.hidden.map(getChart);
    visibleCharts = radarResponse.visible.map(getChart);
    almostVisibleCharts = visibleCharts.concat(radarResponse.almost.map(getChart));
    allCharts = almostVisibleCharts.concat(hiddenCharts);
    updateChartSize();
    almostVisibleCharts.forEach(function(d) {
      if (!d.chart.dataRequested) {
        console.log("Requesting");
        backend.histograms(d.run, d.tag).then(function(data) {
          mutateChart(d.chart, "data", processData(data));
        });
        d.chart.dataRequested = true;
      }
      if (d.chart.dirty) {
        drawChart(d.chart)
      }
    });
  }

  //
  // Events from actions panel
  //
  var actionsPanel = elScope.$.actions;

  actionsPanel.addEventListener("zoomchange", function(e) {
    numColumns = (e.detail.value === "in" ? numColumns / 2 : numColumns * 2);
    updateChartSize();
    render();
    // allCharts.forEach(function(d:any) {
    //   mutateChart(d.chart, "width", chartWidth);
    //   mutateChart(d.chart, "height", chartHeight);
    // });
    // updateVisibleCharts(1000);
  });

  actionsPanel.addEventListener("modechange", function(e) {
    allCharts.forEach(function(d:any) {
      mutateChart(d.chart, "mode", e.detail.value);
    });
    updateVisibleCharts(1000);
  });

  actionsPanel.addEventListener("timechange", function(e) {
    allCharts.forEach(function(d:any) {
      mutateChart(d.chart, "time", e.detail.value);
    });
    updateVisibleCharts(1000);
  });

  function mutateChart(c, property, value) {
    c[property] = value;
    c.dirty = true;
  }

  function drawChart(c, animationDuration?: number) {
    c.draw(animationDuration)
    c.dirty = false
  }

  function updateVisibleCharts(animationDuration) {
    visibleCharts.forEach(function(d:any) {
      drawChart(d.chart, animationDuration)
    });
  }


  //
  // Render skeleton HTML
  //

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



    data = histogramCategories(x);
    data.forEach(function(d: any) {
      d.runsByTag = d3.nest()
          .key(function(d: any) { return d.tag; })
          .entries(d.runTags);
    });
    updateChartSize();
    render();

    // This adds the css scoping necessary for the new elements
    elScope.scopeSubtree(elScope.$.content, false);
  });

  function layout() {
    var categoryMargin = {top: 60, bottom: 20};
    var tagMargin = {top: 35, bottom: 30};
    var chartMargin = {top: 15, right: 10};
    stageWidth = el.getBoundingClientRect().width - 48;
    chartWidth = Math.floor(stageWidth / numColumns) - chartMargin.right;
    chartHeight = Math.min(frame.getBoundingClientRect().height - 40, Math.floor(chartWidth * chartAspectRatio) - chartMargin.top);

    console.log(numColumns, chartWidth, chartHeight)
    var cumulativeCategoryHeight = 0;
    data.forEach(function(category, ci) {
      var cumulativeTagHeight = 0;
      category.runsByTag.forEach(function(tag, ti) {
        tag.values.forEach(function(run, ri) {
          run.x = (ri % numColumns) * (chartWidth + chartMargin.right);
          run.y = Math.floor(ri / numColumns) * (chartHeight + chartMargin.top) + tagMargin.top;
        });
        tag.height = chartHeight * Math.ceil(tag.values.length / numColumns) + tagMargin.bottom + tagMargin.top;
        tag.y = cumulativeTagHeight + categoryMargin.top;
        cumulativeTagHeight += tag.height;
      });
      category.height = cumulativeTagHeight + categoryMargin.bottom + categoryMargin.top;
      category.y = cumulativeCategoryHeight;
      cumulativeCategoryHeight += category.height;
    });
  }


  function render() {
    console.time("render");
    layout();
    var category = chartsContainer.selectAll(".category").data(data, (d: any) => d.name),
        categoryExit = category.exit().remove(),
        categoryEnter = category.enter().append("div").attr("class", "category"),
        categoryUpdate = category
            .style("top", (d) => d.y + "px")
            .style("height", (d) => d.height + "px");

    categoryEnter.append("h3")
        .text((d) => d.name);

    var tag = categoryUpdate.selectAll(".tag").data((d: any) => d.runsByTag, (d: any) => d.key),
        tagExit = tag.exit().remove(),
        tagEnter = tag.enter().append("div").attr("class", "tag"),
        tagUpdate = tag
            .style("top", (d) => d.y + "px")
            .style("height", (d) => d.height + "px");

    tagEnter.append("h4")
        .text((d) => d.key)

    var run = tagUpdate.selectAll(".run").data((d: any) => d.values, (d: any) => d.run),
        runExit = run.exit().remove(),
        runEnter = run.enter().append("div").attr("class", "run"),
        runUpdate = run
            .style("left", (d) => d.x + "px")
            .style("top", (d) => d.y + "px")
            .style("width", chartWidth + "px")
            .style("height", chartHeight + "px");

    runEnter.append("h5")
        .text((d: any) => d.run);

    var histogramEnter = runEnter.append("tf-vz-histogram-series"),
        histogramUpdate = runUpdate.select("tf-vz-histogram-series")
            .property("dirty", true)
            .style("top", "15px")
            .attr("width", chartWidth)
            .attr("height", chartHeight - 15);

    histogramEnter.each(function(d:any) {
      chartsByRunTag[d.run + d.tag] = this;
      radar.add(this, d);
    });
    console.timeEnd("render");
    scan();
  }

  //
  //TODO Processing Data. This needs some work.
  //
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
