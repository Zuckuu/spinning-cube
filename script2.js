function threeD(renderer2, subscriber) {
  const FPS = 10000 / 1000; // frames per second (NTSC, just for the hell of it)
  const [TX, TY, TZ] = [0.01, 0.02, 0.003]; // how many radians to rotate per frame, per axis

  var clipping = false;
  var perspective = true;

  function Matrix(tx, ty, tz) {
    const C = Math.cos,
      S = Math.sin; 

    (tx ||= 0), (ty ||= 0), (tz ||= 0);

    var state = multiply(
      multiply(
        [
          // x-axis
          [1, 0, 0],
          [0, C(tx), S(tx)],
          [0, -S(tx), C(tx)],
        ],
        [
          // y-axis
          [C(ty), 0, S(ty)],
          [0, 1, 0],
          [-S(ty), 0, C(ty)],
        ]
      ),
      [
        // z-axis
        [C(tz), S(tz), 0],
        [-S(tz), C(tz), 0],
        [0, 0, 1],
      ]
    );

    function multiply(A, B) {
      var m = A.length;
      var n = A[0].length;
      var p = B[0].length;
      if (B.length != n)
        throw (
          "bad dimensions: A[" +
          m +
          "," +
          n +
          "] and B[" +
          B.length +
          ", " +
          p +
          "]"
        );
      var rowA,
        colA,
        colB,
        i,
        result = [...new Array(m)].map((el) => new Array(p).fill(0));

     
      for (rowA = 0; rowA < m; rowA++)
        for (colB = 0; colB < p; colB++)
          for (i = 0; i < n; i++) result[rowA][colB] += A[rowA][i] * B[i][colB];

      return result;
    }

    this.transform = function (multiplier) {
      if (!(multiplier instanceof Matrix))
        throw (
          "expecting type Matrix for multiplier, got: " +
          typeof multiplier +
          ", " +
          multiplier
        );
      return new Matrix().setState(multiply(state, multiplier.getState()));
    };

    
    this.inverse = function () {
      var rows = state.length;
      if (rows < 0) throw "state is empty";
      var cols = state[0].length;
      if (rows != cols) throw ("state is not square", state);
      var row, col;
      var result = new Matrix();
      resultState = result.getState();
      for (row = 0; row < rows; row++) {
        for (col = 0; col < cols; col++) {
          resultState[i][j] = state[j][i]; 
        }
      }
      return result;
    };

    this.getState = function () {
      return state;
    };

    this.setState = function (s) {
      
      state = s;
      return this;
    };

    
    this.vector = function (axis) {
      var axis = axis || 0;
      return new Vector(state[axis][0], state[axis][1], state[axis][2]);
    };

    this.pub = function (sub) {
      sub("matrix", state);
      return this;
    };
  }

  function Vector(x, y, z) {
    (x ||= 0), (y ||= 0), (z ||= 0);

    this.scale = function (factor) {
      if (typeof factor !== "number")
        throw "expecting type number for factor, got: " + typeof factor;
      return new Vector(x * factor, y * factor, z * factor);
    };

    this.translate = function (delta) {
      if (!(delta instanceof Vector))
        throw "expecting type Vector for delta, got: " + typeof delta;
      return new Vector(x + delta.X(), y + delta.Y(), z + delta.Z());
    };

    this.transform = function (multiplier) {
      return new Matrix()
        .setState([[x, y, z]])
        .transform(multiplier)
        .vector();
    };

    this.X = (_) => x;
    this.Y = (_) => y;
    this.Z = (_) => z;

    this.unit = function () {
      return new (function (l) {
        var [dx, dy, dz, l] = [x / l, y / l, z / l, l];
        this.scale = function (s) {
          l *= s;
          return this;
        };
        this.vector = function () {
          return new Vector(dx * l, dy * l, dz * l);
        };
      })(Math.sqrt(x * x + y * y + z * z));
    };

    this.parallax = function () {
      if (!perspective) return this;
      var factor = (5 + z) / 5;
      return new Vector(x * factor, y * factor, z);
    };

    this.inverse = function () {
      return new Vector(-x, -y, -z);
    };

    this.pub = function (sub) {
      sub(this.toString());
      return this;
    };

    this.toString = function () {
      return "x: " + x + ", y: " + y + ", z: " + z;
    };
  }

  var shape = new (function () {
    var tx = 0,
      ty = 0,
      tz = 0;

    var vertices = [
      new Vector(-1, -1, -1),
      new Vector(-1, 1, -1),
      new Vector(1, 1, -1),
      new Vector(1, -1, -1),
      new Vector(-1, -1, 1),
      new Vector(-1, 1, 1),
      new Vector(1, 1, 1),
      new Vector(1, -1, 1),
    ];

    var edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];

    this.rotate = function (render) {
      var i,
        j,
        vertices = xform(new Matrix((tx += TX), (ty += TY), (tz += TZ)));
      for (i = 0, j = edges.length; i < j; i++) {
        var [start, end, ok] = clip(
          vertices[edges[i][0]],
          vertices[edges[i][1]]
        );
        if (ok) render(start, end);
      }
      return this;
    };

    this.pub = function (sub) {
      sub(xform(new Matrix(TX, TY, TZ)));
      return this;
    };

    function clip(start, end) {
      if (!clipping) return [start, end, true];
      if (end.Z() > start.Z()) [start, end] = [end, start];
      if (end.Z() > 0) return [null, null, false];
      if (start.Z() <= 0) return [start, end, true];
      return [
        start
          .translate(end.inverse())
          .unit()
          .scale(end.Z() / (end.Z() - start.Z()))
          .vector()
          .translate(end),
        end,
        true,
      ];
    }

    function xform(m) {
      var i,
        j,
        result = new Array(vertices.length);
      for (i = 0, j = vertices.length; i < j; i++) {
        result[i] = vertices[i].transform(m).parallax().pub(console.log);
      }
      return result;
    }
  })();

  if (!renderer2 || !renderer2.getContext) throw "renderer2 is nil";

  var ctx = renderer2.getContext("2d");
  ctx.lineWidth = 5;
  ctx.lineCap = "round";

  function render(start, end) {
    start = start
      .scale(30)
      .translate(new Vector(renderer2.width / 2, renderer2.height / 2));
    end = end
      .scale(30)
      .translate(new Vector(renderer2.width / 2, renderer2.height / 2));
    ctx.beginPath();
    ctx.moveTo(start.X(), start.Y());
    ctx.lineTo(end.X(), end.Y());
    ctx.stroke();
  }

  this.run = function (iterations) {
    var loop = setInterval(
      function (sub) {
        try {
          ctx.clearRect(0, 0, renderer2.width, renderer2.height);
          shape.rotate(render);
          if (iterations-- == 0) clearInterval(loop);
        } catch (e) {
          console.log("bailing from exception:", e);
          clearInterval(loop);
        }
      },
      FPS,
      subscriber
    );
    return this;
  };

  this.toggleClipping = function () {
    clipping = !clipping;
    return this;
  };
}

var runner = new threeD(document.getElementById("renderer2"), console.log).run(
  Infinity
);
